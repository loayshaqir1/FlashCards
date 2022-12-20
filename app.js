const dotenv = require('dotenv');
const express = require('express');
dotenv.config({ path: './config.env' });
//---------------------------------------------------------------------------------------------------------------------
//Connect to the database
const server = require('./server');
const DB = server.connect();
const usersCollection = DB.collection("users");
const wordsCollection = DB.collection("words");
//---------------------------------------------------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.listen(process.env.PORT);
//---------------------------------------------------------------------------------------------------------------------
app.put('/username/:name/wordId/:id/result/:isRight', async (req, res) => {
    await updateWord(req.params.name, Number(req.params.id), req.params.isRight);
    res.send("Word updated");
});
//---------------------------------------------------------------------------------------------------------------------
app.get('/username/:name/level/:user_level', async (req, res) => {
    const tenWords = await getTenWordsForUser(req.params.name, Number(req.params.user_level));
    await addWrongAnswers(tenWords);
    res.json(tenWords);
});
//---------------------------------------------------------------------------------------------------------------------
function createArrayOfIds(words_array) {
    let words_ids = []
    words_array.forEach(word => {
        words_ids.push(word.id);
    })
    return words_ids;
}
//---------------------------------------------------------------------------------------------------------------------
async function getWordsFromCollectionByIds(chosen_words_ids, inCollection = true) {
    let idFilter = { id: { $in: chosen_words_ids } };
    if (!inCollection) {
        idFilter = { id: { $nin: chosen_words_ids } };
    }
    const cursor = await wordsCollection.find(idFilter);
    let chosen_words = await cursor.toArray();
    return chosen_words;
}
//---------------------------------------------------------------------------------------------------------------------
async function addWrongAnswers(tenWords) {
    let chosen_words_ids = createArrayOfIds(tenWords);
    let random_words = await getWordsFromCollectionByIds(chosen_words_ids, false);
    tenWords.forEach(word => {
        let chosen_words = [];
        for (let i = 0; i < process.env.WRONG_CHOICES; i++) {
            // generate a random index in the array
            const index = Math.floor(Math.random() * random_words.length);

            // remove the object at the random index and add it to the result array
            chosen_words.push(random_words.splice(index, 1)[0]['hebrew']);
        }
        word['wrong answers'] = chosen_words;
    });
}
//---------------------------------------------------------------------------------------------------------------------
async function updateWord(username, word_id, is_right) {
    const filter = { 'Name': username };
    user_document = await usersCollection.findOne(filter);
    if (await isFirstTime(user_document, word_id) === true) {
        update = { $push: { Words_Seen: word_id } };
        await usersCollection.updateOne(filter, update);
        if (is_right === 'true') {
            //The student solved the question correctly so we add it to GroupB
            await addWordToGroup(username, word_id, 'GroupB');
        } else {
            //The student solved the question incorrectly so we add it to GroupA
            await addWordToGroup(username, word_id, 'GroupA');
        }
    } else {
        let prevGroup = await findPrevGroup(user_document, word_id);
        if (is_right === 'true') {
            //The student solved the question correctly so we add it to the next group
            await deleteFromGroup(username, word_id, prevGroup);
            await addWordToGroup(username, word_id, getNextGroup(prevGroup));
        }
        else {
            //The student solved the question incorrectly so we add it to GroupA 
            await deleteFromGroup(username, word_id, prevGroup);
            await addWordToGroup(username, word_id, 'GroupA');
        }
    }
}
//---------------------------------------------------------------------------------------------------------------------
function getNextGroup(prev_group) {
    if (prev_group === 'GroupA') return 'GroupB';
    else if (prev_group === 'GroupB') return 'GroupC';
    return 'GroupD';
}
//---------------------------------------------------------------------------------------------------------------------
async function deleteFromGroup(username, word_id, groupName) {
    const filter = { 'Name': username };
    update = { $pull: { [groupName]: { id: word_id } } };
    await usersCollection.updateOne(filter, update);
}
//---------------------------------------------------------------------------------------------------------------------
async function findPrevGroup(user_document, word_id) {
    if (user_document.GroupA.some(word => word.id === word_id)) {
        return 'GroupA';
    } else if (user_document.GroupB.some(word => word.id === word_id)) {
        return 'GroupB';
    }
    else if (user_document.GroupC.some(word => word.id === word_id)) {
        return 'GroupC';
    }
    else return 'GroupD';
}
//---------------------------------------------------------------------------------------------------------------------
async function isFirstTime(user_document, word_id) {
    return (!(user_document.Words_Seen.some(obj => obj === word_id)));
}
//---------------------------------------------------------------------------------------------------------------------
async function getWordsFromGroups(level, user_document) {
    //These arrays contain the words that "we can" show to the user
    let wordsFromA = await getPossibleWordsFromA(level, user_document);
    let wordsFromB = await getPossibleWordsFromDatedGroups(level, user_document.GroupB, process.env.WEEK);
    let wordsFromC = await getPossibleWordsFromDatedGroups(level, user_document.GroupC, 2 * process.env.WEEK);
    let wordsFromD = await getPossibleWordsFromDatedGroups(level, user_document.GroupD, process.env.MONTH);
    let mergedArray = wordsFromA.concat(wordsFromB).concat(wordsFromC).concat(wordsFromD);
    return mergedArray;
}
//---------------------------------------------------------------------------------------------------------------------
function getRandomWords(number, array) {
    let chosen_words = [];
    for (let i = 0; i < number; i++) {
        // generate a random index in the array
        const index = Math.floor(Math.random() * array.length);

        // remove the object at the random index and add it to the result array
        chosen_words.push(array.splice(index, 1)[0]);
    }
    return chosen_words;
}
//---------------------------------------------------------------------------------------------------------------------
async function getWordsByLevel(level) {
    const filter = { lesson: { $lte: level } };
    // find the user_documents
    const cursor = await wordsCollection.find(filter);
    let possible_words = await cursor.toArray();
    return possible_words;
}
//---------------------------------------------------------------------------------------------------------------------
async function getTenWordsForUser(username, level) {
    const filter = { 'Name': username };
    user_document = await usersCollection.findOne(filter);
    if (user_document != null) {
        let mergedArray = await getWordsFromGroups(level, user_document);
        if (mergedArray.length >= process.env.WORDS_TO_FETCH) {

            //try to choose 5 words that he didn't saw before
            let unseen_words = await getUpToNumberUnseenWords(level, user_document, 5, filter);
            let remaining = process.env.WORDS_TO_FETCH - unseen_words.length;

            //choose remaining random words from merged Array
            let chosen_words = getRandomWords(remaining, mergedArray);
            chosen_words_ids = createArrayOfIds(chosen_words);
            chosen_words = getWordsFromCollectionByIds(chosen_words_ids);
            let final_words = await unseen_words.concat(chosen_words);

            return final_words;
        }
        else {
            let unseen_words = await getUpToNumberUnseenWords(level, user_document, process.env.WORDS_TO_FETCH - mergedArray.length, filter);
            let words_without_time_constraint = []

            //Check if there is no new words left to show
            if (unseen_words.length + mergedArray.length < process.env.WORDS_TO_FETCH) {
                let remaining = process.env.WORDS_TO_FETCH - (unseen_words.length + mergedArray.length);
                words_without_time_constraint = await getRemainingWordsWithoutTimeConstraint(user_document, remaining, mergedArray, level);
            }
            chosen_words_ids = createArrayOfIds(mergedArray);
            if (typeof words_without_time_constraint !== 'undefined' && words_without_time_constraint.length > 0) {
                let without_t_c_ids = createArrayOfIds(words_without_time_constraint);
                chosen_words_ids.concat(without_t_c_ids);
            }
            let chosen_words = getWordsFromCollectionByIds(chosen_words_ids);
            let final_words = await unseen_words.concat(chosen_words);

            return final_words;
        }
    }
    //Check if its the first time for the user
    else {
        //Add the new user to the usersCollection
        await addUserToCollection(username);
        // create a filter to select the user_documents
        let possible_words = await getWordsByLevel(level);
        let chosen_words = getRandomWords(process.env.WORDS_TO_FETCH, possible_words);
        return chosen_words;
    }
}
//---------------------------------------------------------------------------------------------------------------------
//This function handles a corner case where the student have seen and correctly solved all of the words in madrasa's vocab.json file
async function getRemainingWordsWithoutTimeConstraint(user_document, remaining, already_chosen_words, level) {
    const filterFunction = (obj) => (obj.lesson <= level && !already_chosen_words.includes(obj));

    //Try to get remaining words from GroupB
    let possible_words = user_document.GroupB.filter(filterFunction);
    let chosen_words = [];

    if (possible_words.length >= remaining) {
        let remaining_words = await getRandomWords(remaining, possible_words);
        chosen_words = chosen_words.concat(remaining_words);
        return chosen_words;
    }
    else {
        chosen_words = possible_words;
        remaining = remaining - chosen_words.length;
        //try to get remaining words from GroupC
        possible_words = user_document.GroupC.filter(filterFunction);

        if (possible_words.length >= remaining) {
            //get random remaining words
            let remaining_words = getRandomWords(remaining, possible_words);
            chosen_words = chosen_words.concat(remaining_words);
            return chosen_words;
        }
        else {
            chosen_words = chosen_words.concat(possible_words);
            remaining = remaining - chosen_words.length;
            possible_words = user_document.GroupD.filter(filterFunction);

            //Try to get remaining words from GroupD
            if (possible_words.length >= remaining) {
                //Get random remaining words
                let remaining_words = getRandomWords(remaining, possible_words);
                chosen_words = chosen_words.concat(remaining_words);
                return chosen_words;
            } else {
                console.log('If this was printed then Asmaa`s logic was wrong');
            }
        }
    }
}
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
    if (possible_words.length <= number) return possible_words;
    else {
        let chosen_words = await getRandomWords(number, possible_words);
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
async function addWordToGroup(username, word_id, groupName) {
    // format the date as a string
    const dateString = getCurrentDate();

    const level = await getLevel(word_id, wordsCollection);
    // return the date object
    let word = {
        'id': word_id,
        'lesson': level,
        'Date Entered': dateString
    };
    const filter = { 'Name': username };
    update = { $push: { [groupName]: word } };
    await usersCollection.updateOne(filter, update);
}
//---------------------------------------------------------------------------------------------------------------------
/*  @CORNER CASES@:

*/
//-----------------------------------------------TESTING FUNCTIONS-----------------------------------------------------
app.get('/', async (req, res) => {
    await addTenRandomUsers();
    res.send("Users Added");
});
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
    for (let i = 0; i < 3; i++) {
        await addUserToCollection(names[i]);
    }
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 5; j++) {
            await addWordsToUser(names[i]);
        }
    }
}
//---------------------------------------------------------------------------------------------------------------------
async function getRandomWord(wordsCollection) {
    //generate a random ID
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
