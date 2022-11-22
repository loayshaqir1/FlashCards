const dotenv = require('dotenv');
const express = require('express');
const app = express();
app.use(express.json());
const server = require('./server');

dotenv.config({ path: './config.env' });
app.listen(process.env.PORT);

app.get('/', async (req,res) => {
    const DB = await server.connect();
    const collections = await DB.collections();
    collections.forEach(c => console.log(c.collectionName));
    res.send("HELLO !@#!@#!@#!@");
});
