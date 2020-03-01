// Software Configuration.

const configuration = {
    commPort: "somePath",
    calibration: 517,
    voltageTolerance: 10,
    serverPort: 3030,
    sample: 40,
    availablePorts: []
}


// Import libs
const Serialport = require('serialport');
const Readline = require('@serialport/parser-readline')
const Express = require('express');
const Mustache = require('mustache-express');
const sqlite3 = require('sqlite3').verbose();

// Get a list of serial ports
Serialport.list().then((portList, error)=>{
   configuration.availablePorts = portList;
});

// instance of express
const express = Express();
// Start express using port 3030
const expressServer = express.listen(configuration.serverPort, () => {
    console.log('Express Server started on port:', configuration.serverPort);
});
// Import Socket 
const io = require('socket.io')(expressServer); // short hand to bind Socket IO with Express Server.
// Set express template engine
express.engine('html', Mustache());
express.set('view engine', 'html');
express.set('views', __dirname + '/views')

// open Db, if it note found it should console an error otherwise a confirmation that is available. 
let db = new sqlite3.Database('data/db.db', sqlite3.OPEN_READWRITE, (error) => {
    if (error) {
      console.error(error.message);
    }
    console.log('Database Connected.');
});

// Load index page
express.get('/', (req, res) => {
    res.render('index.html', configuration);
});

express.get('/plot', (req, res) => {
    //setting the default
    configuration.isLearnMode = 'off';
    //Check query parameters are sent
    if (!(Object.entries(req.query).length === 0)) {
        // Iterate all queries params
        for (const property in req.query) {
            //check if queries are not empty
            if(!(req.query[property]==='')){
                // updates configuration using new value.
                configuration[property] = req.query[property];
            }
        }
    }

    // Open serial port connection to Arduino Uno
    const port = new Serialport(configuration.commPort,{baudRate: 9600}); // instance of the port

    // This generates an instance of the parser to read each line returned by Arduino.
    const parser = new Readline();
    // Instruct the port instance to use the parser
    port.pipe(parser);
   

    // Some variables to hold voltage values.
    let sample = 0;
    let sampleData = [];
    let maxSampleVolt = 0;

    // Listener to arduino input - is data sent it will get the voltageReading
    parser.on('data',(voltageReading)=>{
        // Remove trailing end of line and convert to integer
        voltageReading = parseInt(voltageReading.substring(0, voltageReading.length - 1));
        // Evaluate if current sample is less than configured value.
        if (sample < (configuration.sample - 1)) {
            sampleData.push(voltageReading);
            sample ++
        } else {
            sampleData.push(voltageReading);
            maxSampleVolt = Math.max.apply(null,sampleData);
            console.log('Sample Data:', sampleData);
            console.log('Max Voltage:', maxSampleVolt);
            // if maxSampleVolt is less than calibration then we what to send calibration number
            if (maxSampleVolt <= configuration.calibration) {
                maxSampleVolt = configuration.calibration;
            }
            let today = new Date();
            io.sockets.emit('reading', {date: today.getDate()+"-"+today.getMonth()+1+"-"+today.getFullYear(), time: (today.getHours())+":"+(today.getMinutes()), voltageReading:maxSampleVolt}); //emit data to clients
            sampleData = [];
            sample = 0;
            if(configuration.isLearnMode === 'on'){
                // need to read from DB.
                let lowVoltageOffset = maxSampleVolt - configuration.voltageTolerance;
                let highVoltageOffset = maxSampleVolt + configuration.voltageTolerance;
                // Get suggested position using avgs of the 
                db.serialize(() => { 
                    db.get('SELECT avg(wristX) AS X, avg(wristY) AS Y, avg(distance) AS distance, avg(angle) AS angle, avg(velocity) AS velocity FROM movement WHERE voltage BETWEEN ? AND ?',[ lowVoltageOffset, highVoltageOffset], (error, record) => {
                        if(error) {
                            console.log(error.message);
                        }
                        console.log(record);
                        //send information to client
                        io.sockets.emit('learning', {voltage:maxSampleVolt, prediction:record}); //emit data to clients
                        // check if prediction is not null to learn from it.
                        if (record.X != null) {
                            db.run('INSERT INTO movement(time,voltage,wristX,wristY,distance,angle,velocity) VALUES(?,?,?,?,?,?,?)', [Date.now(), maxSampleVolt, record.X, record.Y, record.distance, record.angle, record.velocity], (err) => {
                                if(err) {
                                    return console.log(err.message); 
                                }
                                console.log('Row was added to the table: ${this.lastID}');
                            });
                        }
                        // insert results as new record
                    });
                });
            }
        }
    });
    
    res.render('plot.html');
});

//Validate that there is a connection 
io.on('connection', (socket) => {
    console.log("Client connected."); //show a log as a new client connects.
});
