const configuration = {
    commPort: "/dev/cu.usbmodem142401",
    voltageTolerance: 10
}


// Require the serialport node module
const Serialport = require('serialport');
const Readline = require('@serialport/parser-readline')
// Require Db module
const sqlite3 = require('sqlite3').verbose();


// open Db, if it note found it should console an error otherwise a confirmation that is available. 
let db = new sqlite3.Database('data/db.db', sqlite3.OPEN_READWRITE, (error) => {
    if (error) {
      console.error(error.message);
    }
    console.log('Database Connected.');
});

// TODO: put this inside of the serial loop. 
let currentVoltage = 600;
let lowVoltageOffset = currentVoltage - configuration.voltageTolerance;
let highVoltageOffset = currentVoltage + configuration.voltageTolerance;
// Get suggested position using avgs of the 
db.serialize(() => { 
    db.get('SELECT avg(wristX) AS X, avg(wristY) AS Y, avg(distance) AS distance, avg(angle) AS angle, avg(velocity) AS velocity FROM movement WHERE voltage BETWEEN ? AND ?',[ lowVoltageOffset, highVoltageOffset], (error, record) => {
        if(error) {
            console.log(error.message);
        }
        console.log(record);
    });
});

// Open serial port connection to Arduino Uno
const port = new Serialport(configuration.commPort,{
    baudRate: 9600
}); // instance of the port

// This generates an instance of the parser to read each line returned by Arduino.
const parser = new Readline();
// Instruct the port instance to use the parser
port.pipe(parser);

let reading = 1;
// Listener to arduino input - is data sent it will get the voltageReading
parser.on('data',(voltageReading)=>{
    reading ++;
    console.log(voltageReading);
});