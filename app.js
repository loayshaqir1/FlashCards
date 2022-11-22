const dotenv = require('dotenv');
const express = require('express');
const app = express();
app.use(express.json());
const server = require('./server');

dotenv.config({ path: './config.env' });
app.listen(process.env.PORT);

app.get('/', async (req, res) => {
    const DB = await server.connect();
    const tenWords = await generateTenWords(DB.collection("words"), randomTenNumbers(1, 424));
    let words = []
    tenWords.forEach(element => words.push(element)).then(() => { res.status(200).json(words) });
});

function randomTenNumbers(min, max) {
    let n = [];
    for (let i = 0; i < 10; i++) {
        n.push(Math.floor(Math.random() * max) + min);
    }
    return n;
}

async function generateTenWords(collection, n) {
    return await collection.find({ "id": { $in: n } });
}
