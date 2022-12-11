const dotenv = require('dotenv');
const { json } = require('express');
const express = require('express');
const server = require('./server');

dotenv.config({ path: './config.env' });

const DB = server.connect();
const usersCollection = DB.collection("users");
const wordsCollection = DB.collection("words");
const app = express();
app.use(express.json());
app.listen(process.env.PORT);
//---------------------------------------------------------------------------------------------------------------------
app.get('/', async (req, res) => {
    const run_first = await addTenRandomUsers();
    if (run_first) {
        const tenWords = await getTenWordsForUser('Henry', 5);
        res.json(tenWords);
    }
});
//---------------------------------------------------------------------------------------------------------------------
async function getTenWordsForUser(username, level) {
    const filter = { 'Name': username };
    document = await usersCollection.findOne(filter);
    if (document != null) {
        //This array contains the words that "we can" show to the user
        let wordsFromA = await getPossibleWordsFromA(level, document);
        let wordsFromB = await getPossibleWordsFromDatedGroups(level, document.GroupB, 7);
        let wordsFromC = await getPossibleWordsFromDatedGroups(level, document.GroupC, 14);
        let wordsFromD = await getPossibleWordsFromDatedGroups(level, document.GroupD, 30);
        let mergedArray = wordsFromA.concat(wordsFromB).concat(wordsFromC).concat(wordsFromD);
        // console.log(mergedArray.length);
        // console.log(mergedArray);
        if (mergedArray.length >= 10) {
            //try to choose 5 words that he didn't saw before
            let unseen_words = await getUpToNumberUnseenWords(level, document, 5, filter);
            let remaining = 10 - unseen_words.length;
            //choose remaining random words from merged Array
            let chosen_words = [];
            for (let i = 0; i < remaining; i++) {
                // generate a random index in the array
                const index = Math.floor(Math.random() * mergedArray.length);

                // remove the object at the random index and add it to the result array
                chosen_words.push(mergedArray.splice(index, 1)[0]);
            }
            chosen_words_ids = [];
            chosen_words.forEach(word => {
                chosen_words_ids.push(word.id);
            });
            const idFilter = { id: { $in: chosen_words_ids } };
            const cursor = await wordsCollection.find(idFilter);
            chosen_words = await cursor.toArray();
            let final_words = await unseen_words.concat(chosen_words);
            return final_words;
        } else {
            let unseen_words = await getUpToNumberUnseenWords(level, document, 10 - mergedArray.length, filter);
            chosen_words_ids = [];
            let chosen_words = [];
            mergedArray.forEach(word => {
                chosen_words_ids.push(word.id);
            });
            const idFilter = { id: { $in: chosen_words_ids } };
            const cursor = await wordsCollection.find(idFilter);
            chosen_words = await cursor.toArray();
            let final_words = await unseen_words.concat(chosen_words);
            return final_words;
        }
    }
    //if its the first time for the user
    else {
        //Add the new user to the usersCollection
        await addUserToCollection(username);
        // create a filter to select the documents
        const filter = { lesson: { $lte: level } };
        let chosen_words = []
        // find the documents
        const documents = await wordsCollection.find(filter);
        let possible_words = await documents.toArray();
        for (let i = 0; i < 10; i++) {
            // generate a random index in the array
            const index = Math.floor(Math.random() * possible_words.length);

            // remove the object at the random index and add it to the result array
            chosen_words.push(possible_words.splice(index, 1)[0]);
        }
        const nameFilter = { 'Name': username };
        document = await usersCollection.findOne(nameFilter);
        chosen_words_ids = [];
        chosen_words.forEach(word => {
            chosen_words_ids.push(word.id);
        });
        update = { $push: { Words_Seen: { $each: chosen_words_ids } } };
        await usersCollection.updateOne(nameFilter, update);
        return chosen_words;
    }
}
//---------------------------------------------------------------------------------------------------------------------
//@@ make choosing the words from Groups B,C,D more fair
//---------------------------------------------------------------------------------------------------------------------
async function getUpToNumberUnseenWords(level, user_document, number, nameFilter) {
    const filter = {
        $and: [
            { lesson: { $lte: level } },
            { id: { $nin: user_document.Words_Seen } }
        ]
    };
    const cursor = await wordsCollection.find(filter);
    let possible_words = await cursor.toArray();
    if (possible_words.length <= number) {
        //update the Words_Seen array in user_document
        chosen_words_ids = [];
        possible_words.forEach(word => {
            chosen_words_ids.push(word.id);
        });
        update = { $push: { Words_Seen: { $each: chosen_words_ids } } };
        await usersCollection.updateOne(nameFilter, update);
        return possible_words;
    }
    else {
        let chosen_words = []
        for (let i = 0; i < number; i++) {
            // generate a random index in the array
            const index = Math.floor(Math.random() * possible_words.length);

            // remove the object at the random index and add it to the result array
            chosen_words.push(possible_words.splice(index, 1)[0]);
        }
        //update the Words_Seen array in user_document
        chosen_words_ids = [];
        chosen_words.forEach(word => {
            chosen_words_ids.push(word.id);
        });
        update = { $push: { Words_Seen: { $each: chosen_words_ids } } };
        await usersCollection.updateOne(nameFilter, update);
        return chosen_words;
    }
}
//---------------------------------------------------------------------------------------------------------------------
async function getPossibleWordsFromA(level, user_document) {
    const filterFunction = (obj) => obj.lesson <= level;
    const possible_words = user_document.GroupA.filter(filterFunction);
    return possible_words;
}
//---------------------------------------------------------------------------------------------------------------------
async function getPossibleWordsFromDatedGroups(level, groupArray, minDays) {
    const todaysDate = getCurrentDate();
    const filterFunction = (obj) => obj.lesson <= level;
    const possible_words = groupArray.filter(filterFunction);
    let result = []
    possible_words.forEach(document => {
        const date1 = todaysDate;
        const date2 = document['Date Entered'];

        const dateObject1 = new Date(date1);
        const dateObject2 = new Date(date2);

        // subtract the earlier date from the later date to get the number of milliseconds
        const timeDiff = Math.abs(dateObject2 - dateObject1);

        // divide the number of milliseconds by the number of milliseconds in a day to get the number of days
        const diffDays = Math.ceil(timeDiff / (1000 * 3600 * 24));

        if (diffDays >= minDays) {
            result.push(document);
        }
    });
    return result;
}
//---------------------------------------------------------------------------------------------------------------------
async function addWordsToUser(username) {
    const filter = { 'Name': username };
    document = await usersCollection.findOne(filter);
    let word1 = await getRandomWord(wordsCollection);
    let word2 = await getRandomWord(wordsCollection);
    let word3 = await getRandomWord(wordsCollection);
    let word4 = await getRandomWord(wordsCollection);
    update = { $push: { GroupA: word1 } };
    await usersCollection.updateOne(filter, update);
    update = { $push: { GroupB: word2 } };
    await usersCollection.updateOne(filter, update);
    update = { $push: { GroupC: word3 } };
    await usersCollection.updateOne(filter, update);
    update = { $push: { GroupD: word4 } };
    await usersCollection.updateOne(filter, update);
    update = { $push: { Words_Seen: { $each: [word1.id, word2.id, word3.id, word4.id] } } };
    await usersCollection.updateOne(filter, update);
}
//---------------------------------------------------------------------------------------------------------------------
async function addTenRandomUsers() {
    const names = [
        "Henry",
        "Richard",
        "John",
        "Edward",
        "George",
        "Charles",
        "William",
        "Frederick",
        "Arthur",
        "Albert"
    ];
    const filter = { 'Name': 'Henry' };
    document = await usersCollection.findOne(filter);
    if (document == null) {
        for (let i = 0; i < 3; i++) {
            await addUserToCollection(names[i]);
        }
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 5; j++) {
                await addWordsToUser(names[i]);
            }
            return 1;
        }
    } else {
        return 1;
    }
}
//---------------------------------------------------------------------------------------------------------------------
function getCurrentDate() {
    // create a new Date object
    const date = new Date();

    // format the date as a string
    const dateString = date.toLocaleDateString();

    // return the date string
    return dateString;
}
//---------------------------------------------------------------------------------------------------------------------
function addUserToCollection(username) {
    // check if the collection exists
    if (!usersCollection) {
        throw new Error("Collection does not exist");
    }

    // create the document to be added
    const document = {
        'Name': username,
        GroupA: [],
        GroupB: [],
        GroupC: [],
        GroupD: [],
        Words_Seen: []
    };

    // add the document to the collection
    usersCollection.insertOne(document);
}
//---------------------------------------------------------------------------------------------------------------------
async function getLevel(id, wordsCollection) {
    const filter = { 'id': id };
    document = await wordsCollection.findOne(filter);
    return document.lesson;
}
//---------------------------------------------------------------------------------------------------------------------
async function getRandomWord(wordsCollection) {
    // generate a random ID
    const id = Math.floor(Math.random() * 424) + 1;

    // format the date as a string
    const dateString = getCurrentDate();

    const level = await getLevel(id, wordsCollection);
    // return the date object
    return {
        'id': id,
        'lesson': level,
        'Date Entered': dateString
    };
}
//---------------------------------------------------------------------------------------------------------------------



