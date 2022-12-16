const { MongoClient, ServerApiVersion } = require('mongodb');
const dotenv = require('dotenv');

dotenv.config({ path: './config.env' });
const uri = process.env.DATABASE.replace('<password>', process.env.DATABASE_PASSWORD);
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function connect() {
    try {
        client.connect();
        return client.db("FlashCards");
    } catch (err) {
        console.log(`Error: ${err}`);
    } finally {
        // 
    }
}

module.exports = { connect };

