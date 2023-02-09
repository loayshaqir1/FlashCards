const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');
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
app.use(cors());
app.listen(process.env.PORT);
//---------------------------------------------------------------------------------------------------------------------
app.put('/username/:name/wordId/:id/result/:isRight', async (req, res) => {
    /* 
    *
    * This function executes after each answer the student submits.
    * It updates the database based on whether the answer was correct or not,
    * and the word is placed in the appropriate box according to Leitner's system.
    *
    * Args:
    *       name : The name of the student.
    *       id: The id of the word displayed to student.
    *       isRight: A Boolean value that says wether the student correctly answered or not.
    *
    * Return: This function does not return anything, it just updates the database.  
    *  
    */
    let hitrate = await updateWord(req.params.name, Number(req.params.id), req.params.isRight);
    res.json({"LeitnersHitRate": hitrate});
});
//---------------------------------------------------------------------------------------------------------------------
app.get('/username/:name/level/:user_level', async (req, res) => {
    /* 
    *
    * This function is activated when the student enters the flashcards app and selects the option to study words up to a specified level.
    *
    * Args:
    *       name : The name of the student.
    *       user_level : The session number that the student wishes to practice words up to.
    *
    * Return: Array that consists of 10 words chosen for the student by the Leitner's system.
    *    
    *  
    */
    const tenWords = await getTenWordsForUser(req.params.name, Number(req.params.user_level));
    await addWrongAnswers(tenWords);
    res.json(tenWords);
});
//---------------------------------------------------------------------------------------------------------------------
app.get('/username/:name/level/:user_level/without_wrong_answers', async (req, res) => {
    /* 
    *
    * This function is the same as the above function with an only difference that it does not return the words with wrong answers array,
    *   
    *
    * Args:
    *       name : The name of the student.
    *       user_level : The session number that the student wishes to practice words up to.
    *
    * Return: Array that consists of 10 words chosen for the student by the Leitner's system. (without wrong answers).
    *    
    *  
    */
    const tenWords = await getTenWordsForUser(req.params.name, Number(req.params.user_level));
    res.json(tenWords);
});
//---------------------------------------------------------------------------------------------------------------------
function createArrayOfIds(words_array) {
    /* 
    * This function takes an array of word objects and returns an array that contains the id's of those words.
    */
    let words_ids = []
    words_array.forEach(word => {
        words_ids.push(word.id);
    })
    return words_ids;
}
//---------------------------------------------------------------------------------------------------------------------
async function getWordsFromCollectionByIds(chosen_words_ids, inCollection = true) {
    /* 
    *
    * This function takes an array of words id's, and it searches in the wordsCollection in the database for the words,
    * with the given id's, or exclude those words.
    * 
    * the inCollection flag is set to true when we want to search for the words of the given id's, and its false when 
    * we want all the words in the collection excluding the words in chosen_words_ids.
    * 
    */
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
    /*
    *
    * This function is triggered when we need to send the user 10 questions.
    * For each question, we include four additional incorrect answers as multiple choice options.
    * These incorrect answers are randomly generated and unique to each question.
    *
    */
    let chosen_words_ids = createArrayOfIds(tenWords);
    let random_words = await getWordsFromCollectionByIds(chosen_words_ids, false);
    var question_words = random_words.filter(function (word) {
        return word.hebrew.includes("?");
    });
    random_words = random_words.filter(function (word) {
        return !question_words.includes(word);
    });
    tenWords.forEach(word => {
        let chosen_words = [];
        if (word.arabic.includes("?")) {
            for (let i = 0; i < process.env.WRONG_CHOICES; i++) {
                // generate a random index in the array
                const index = Math.floor(Math.random() * question_words.length);

                // remove the object at the random index and add it to the result array
                chosen_words.push(question_words.splice(index, 1)[0]['hebrew']);
            }
        } else {
            for (let i = 0; i < process.env.WRONG_CHOICES; i++) {
                // generate a random index in the array
                const index = Math.floor(Math.random() * random_words.length);

                // remove the object at the random index and add it to the result array
                chosen_words.push(random_words.splice(index, 1)[0]['hebrew']);
            }
        }
        word['wrong answers'] = chosen_words;
    });
}
//---------------------------------------------------------------------------------------------------------------------
async function updateWord(username, word_id, is_right) {
    /*
    * This function executes after each answer the student submits,
    * and updates the database according to the student's answer while adhering to the principles of Leitner's system.
    *
    * Args:
    *       username : The name of the student.
    *       word_id: The id of the word displayed to student.
    *       is_right: A Boolean value that says wether the student answered correctly or not.
    *
    * Return: This function does not return anything, it just updates the database.  
    */

    const filter = { 'Name': username };
    user_document = await usersCollection.findOne(filter);
    if(user_document == null){
        console.log("User don't exist!");
        return;
    }
    if (await isFirstTime(user_document, word_id) === true) {
        update = { $push: { Words_Seen: word_id } };
        await usersCollection.updateOne(filter, update);
        if (is_right === 'true') {
            //The student solved the question correctly so we add it to GroupB
            await addWordToGroup(username, word_id, 'GroupB', true);
            return 1;
        } else {
            //The student solved the question incorrectly so we add it to GroupA
            await addWordToGroup(username, word_id, 'GroupA');
            return 0;
        }
    } else {
        let prevGroup = await findPrevGroup(user_document, word_id);
        if (is_right === 'true') {
            //The student solved the question correctly so we add it to the next group
            await deleteFromGroup(username, word_id, prevGroup);
            await addWordToGroup(username, word_id, getNextGroup(prevGroup), true);
            let newHitRate = (user_document.leitner_correctly_answered + 1) / (user_document.leitner_times_appeared + 1)
            usersCollection.updateOne(
                filter,
                {
                    $inc: { leitner_correctly_answered: 1, leitner_times_appeared: 1 },
                    $set: { LeitnersHitRate: newHitRate }
                }
            )
            return newHitRate;
        }
        else {
            //The student solved the question incorrectly so we add it to GroupA 
            await deleteFromGroup(username, word_id, prevGroup);
            await addWordToGroup(username, word_id, 'GroupA');
            let newHitRate = (user_document.leitner_correctly_answered) / (user_document.leitner_times_appeared + 1)
            usersCollection.updateOne(
                filter,
                {
                    $inc: { leitner_times_appeared: 1 },
                    $set: { LeitnersHitRate: newHitRate }
                }
            )
            return newHitRate;
        }
    }
}
//---------------------------------------------------------------------------------------------------------------------
function getNextGroup(prev_group) {
    // Check if the previous group was "GroupA"
    if (prev_group === 'GroupA') {
        // If it was, return "GroupB"
        return 'GroupB';
    }
    // Otherwise, check if the previous group was "GroupB"
    else if (prev_group === 'GroupB') {
        // If it was, return "GroupC"
        return 'GroupC';
    }
    // If the previous group was neither "GroupA" nor "GroupB", return "GroupD"
    return 'GroupD';
}

//---------------------------------------------------------------------------------------------------------------------
async function deleteFromGroup(username, word_id, groupName) {
    // Construct a filter to find the document with the specified "username"
    const filter = { 'Name': username };

    // Construct an update object to remove the word with the specified "word_id" from the group with the specified "groupName"
    update = { $pull: { [groupName]: { id: word_id } } };
    await usersCollection.updateOne(filter, update);
}
//---------------------------------------------------------------------------------------------------------------------
async function findPrevGroup(user_document, word_id) {
    // Check if the word with the specified "word_id" exists in the "GroupA" array of the "user_document"
    if (user_document.GroupA.some(word => word.id === word_id)) {
        // If it does, return "GroupA"
        return 'GroupA';
    }
    // Otherwise, check if the word exists in the "GroupB" array
    else if (user_document.GroupB.some(word => word.id === word_id)) {
        // If it does, return "GroupB"
        return 'GroupB';
    }
    // Otherwise, check if the word exists in the "GroupC" array
    else if (user_document.GroupC.some(word => word.id === word_id)) {
        // If it does, return "GroupC"
        return 'GroupC';
    }
    // If the word is not found in any of the above arrays, return "GroupD"
    else return 'GroupD';
}

//---------------------------------------------------------------------------------------------------------------------
async function isFirstTime(user_document, word_id) {

    /*
    *
    * This function verifies whether it is the first time the user has encountered a particular word in the database.
    * We have a field called "words_seen" which keeps track of the words that the student has been asked about and responded to using the put function.
    * 
    */
    return (!(user_document.Words_Seen.some(obj => obj === word_id)));
}
//---------------------------------------------------------------------------------------------------------------------
async function getWordsFromGroups(level, user_document) {
    /*
    *
    * This function returns an array of words that can be presented to the student based on the principles of Leitner's system.
    * See explanation for the functions used to do that.
    */
    let wordsFromA = await getPossibleWordsFromA(level, user_document);
    let wordsFromB = await getPossibleWordsFromDatedGroups(level, user_document.GroupB, process.env.WEEK);
    let wordsFromC = await getPossibleWordsFromDatedGroups(level, user_document.GroupC, 2 * process.env.WEEK);
    let wordsFromD = await getPossibleWordsFromDatedGroups(level, user_document.GroupD, process.env.MONTH);
    let mergedArray = wordsFromA.concat(wordsFromB).concat(wordsFromC).concat(wordsFromD);
    return mergedArray;
}
//---------------------------------------------------------------------------------------------------------------------
function getRandomWords(number, array) {
    /*
    * This function receives an array and a number of words to select, and randomly selects a specified number of words from the array.
    */
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
    /*
    * This function returns all the words in the wordsCollection whose lesson is <= given level.
    */
    const filter = { lesson: { $lte: level } };
    const cursor = await wordsCollection.find(filter);
    let possible_words = await cursor.toArray();
    return possible_words;
}
//---------------------------------------------------------------------------------------------------------------------
async function getTenWordsForUser(username, level) {
    /*
    *
    * This function is the primary implementation for app.get(/username/level).
    * It returns 10 words to the student with the specified username based on the principles of Leitner's system.
    * 
    * Args:
    *       username : The name of the student.
    *       level : The session number that the student wishes to practice words up to.
    *
    * Return: Array that consists of 10 words chosen for the student by the Leitner's system.
    *
    */
    const filter = { 'Name': username };
    user_document = await usersCollection.findOne(filter);

    //Check if its first time that the student uses our tool.
    if (user_document != null) {
        //try to get 10 words based on the principals of Leitner's system.
        let mergedArray = await getWordsFromGroups(level, user_document);
        if (mergedArray.length >= process.env.WORDS_TO_FETCH) {

            //try to choose 5 words that the student haven't seen
            let unseen_words = await getUpToNumberUnseenWords(level, user_document, 5, filter);
            let remaining = process.env.WORDS_TO_FETCH - unseen_words.length;

            //choose remaining random words from merged Array
            let chosen_words = getRandomWords(remaining, mergedArray);
            chosen_words_ids = createArrayOfIds(chosen_words);
            chosen_words = getWordsFromCollectionByIds(chosen_words_ids);
            let final_words = await unseen_words.concat(chosen_words);

            return final_words;
        }
        //If we don't have enough words to show from Leitner's boxes we show him new words that he haven't seen yet.
        else {
            let unseen_words = await getUpToNumberUnseenWords(level, user_document, process.env.WORDS_TO_FETCH - mergedArray.length, filter);
            let words_without_time_constraint = []

            //Check if there is no new words left to show.
            if (unseen_words.length + mergedArray.length < process.env.WORDS_TO_FETCH) {
                let remaining = process.env.WORDS_TO_FETCH - (unseen_words.length + mergedArray.length);
                words_without_time_constraint = await getRemainingWordsWithoutTimeConstraint(user_document, remaining, mergedArray, level);
            }
            chosen_words_ids = await createArrayOfIds(mergedArray);
            if (typeof words_without_time_constraint !== 'undefined' && words_without_time_constraint.length > 0) {
                let without_t_c_ids = createArrayOfIds(words_without_time_constraint);
                chosen_words_ids.concat(without_t_c_ids);
            }
            let chosen_words = await getWordsFromCollectionByIds(chosen_words_ids);
            let final_words = await unseen_words.concat(chosen_words);
            return final_words;
        }
    }
    //if its the first time for the user
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
async function getRemainingWordsWithoutTimeConstraint(user_document, remaining, already_chosen_words, level) {
    /*
    *
    * This function handles a corner case where the student have seen and correctly solved all of the words in madrasa's vocab.json file
    * 
    */
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
                console.log("Something is wrong, shouldn't get here!")
            }
        }
    }
}
//---------------------------------------------------------------------------------------------------------------------
async function getUpToNumberUnseenWords(level, user_document, number) {
    /*
    * This function tries to get <number> of words that the student haven't seen before.
    */

    // Construct a filter to find words with a lesson level less than or equal to "level"
    // and an id that does not appear in the list of seen words for the user
    const filter = {
        $and: [
            { lesson: { $lte: level } },
            { id: { $nin: user_document.Words_Seen } }
        ]
    };
    // Use the filter to retrieve a cursor to the matching documents in the "wordsCollection"
    const cursor = await wordsCollection.find(filter);
    let possible_words = await cursor.toArray();
    // If the number of possible words is less than or equal to the desired number, return the entire array
    if (possible_words.length <= number) return possible_words;
    else {
        // Otherwise, call the "getRandomWords" function to select a specified number of random words from "possible_words"
        // and return the result
        let chosen_words = await getRandomWords(number, possible_words);
        return chosen_words;
    }
}
//---------------------------------------------------------------------------------------------------------------------
async function getPossibleWordsFromA(level, user_document) {
    // Define a function that takes an object and returns true if the object's "lesson" property is less than or equal to "level"
    const filterFunction = (obj) => obj.lesson <= level;

    // Use the "filter" method on the "GroupA" array, passing in the "filterFunction" as an argument
    // This will return a new array containing only the elements of "GroupA" that pass the filter
    const possible_words = user_document.GroupA.filter(filterFunction);

    // Return the resulting array of possible words
    return possible_words;
}

//---------------------------------------------------------------------------------------------------------------------
async function getPossibleWordsFromDatedGroups(level, groupArray, minDays) {
    // Get the current date
    const todaysDate = getCurrentDate();

    // Define a function that takes an object and returns true if the object's "lesson" property is less than or equal to "level"
    const filterFunction = (obj) => obj.lesson <= level;

    // Use the "filter" method on the "groupArray" array, passing in the "filterFunction" as an argument
    // This will return a new array containing only the elements of "groupArray" that pass the filter
    const possible_words = groupArray.filter(filterFunction);

    // Initialize an empty array to store the resulting words
    let result = []

    // Iterate over each word in the "possible_words" array
    possible_words.forEach(document => {
        // Get the current date and the date the word was added to the group
        const date1 = todaysDate;
        const date2 = document['Date Entered'];

        // Convert the dates to Date objects
        const dateObject1 = new Date(date1);
        const dateObject2 = new Date(date2);

        // Calculate the number of milliseconds between the two dates by subtracting the earlier date from the later date
        const timeDiff = Math.abs(dateObject2 - dateObject1);

        // Calculate the number of days between the two dates by dividing the number of milliseconds by the number of milliseconds in a day
        const diffDays = Math.ceil(timeDiff / (1000 * 3600 * 24));

        // If the number of days is greater than or equal to the specified minimum, add the word to the "result" array
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
        Words_Seen: [],
        correctly_solved: 0,
        LeitnersHitRate: -1,
        leitner_times_appeared: 0,
        leitner_correctly_answered: 0
    };

    // add the document to the collection
    usersCollection.insertOne(document);
}
//---------------------------------------------------------------------------------------------------------------------
async function getLevel(id, wordsCollection) {
    // Construct a filter to find the word with the specified "id"
    const filter = { 'id': id };

    // Use the filter to retrieve a single document from the "wordsCollection"
    document = await wordsCollection.findOne(filter);

    // Return the "lesson" property of the retrieved document
    return document.lesson;
}
//---------------------------------------------------------------------------------------------------------------------
async function addWordToGroup(username, word_id, groupName, is_correct = false) {
    // Format the current date as a string
    const dateString = getCurrentDate();

    // Retrieve the lesson level of the word from the "wordsCollection"
    const level = await getLevel(word_id, wordsCollection);

    // Create a new object representing the word
    let word = {
        'id': word_id,
        'lesson': level,
        'Date Entered': dateString
    };

    // Construct a filter to find the document with the specified "username"
    const filter = { 'Name': username };

    // Construct an update object to add the word to the group with the specified "groupName"
    update = { $push: { [groupName]: word } };

    // If the word was answered correctly, modify the update object to also increment the "correctly_solved" property by 1
    if (is_correct) {
        update = {
            $push: { [groupName]: word },
            $inc: { correctly_solved: 1 }
        };
    }

    // Update the word document in the "wordsCollection" with the number of times it has appeared and the number of times it has been answered correctly
    await wordsCollection.findOneAndUpdate(
        { id: word_id },
        {
            $inc: { times_appeared: 1, correctly_answered: is_correct ? 1 : 0 }
        }
    );

    // Retrieve the updated word document and calculate the new hit rate
    wordsCollection.findOne({
        id: word_id
    }, { correctly_answered: 1, times_appeared: 1 })
        .then((word) => {
            if (word) {
                newHitRate = word.correctly_answered / word.times_appeared
                wordsCollection.findOneAndUpdate({ id: word_id }, {
                    $set: { hitrate: newHitRate }
                })
            } else {
                console.log("Word not found");
            }
        });
    await usersCollection.updateOne(filter, update);
}
//---------------------------------------------------------------------------------------------------------------------
/*************************************************** Leader Board ****************************************************/
//---------------------------------------------------------------------------------------------------------------------
/*
* This feature ranks students based on the number of correct questions they have solved,
* providing a sense of competition and motivation for students to improve their skills.
* The leaderboard is updated in real-time, so students can see how they compare to their peers in real-time.
* The leaderboard can be accessed by all students and is a great way to encourage friendly competition and drive students to do their best.
* Admins can also use the leaderboard to identify top performers and provide additional support and resources to those who may be struggling.
* Overall, the leaderboard is a fun and engaging way to track student progress and encourage learning
*/
//---------------------------------------------------------------------------------------------------------------------
app.get('/leaderboard', async (req, res) => {
    const tenStudents = await getTopTenStudents();
    res.json(tenStudents);
});
//---------------------------------------------------------------------------------------------------------------------
async function getTopTenStudents() {
    // Retrieve the top 10 documents in the "usersCollection" sorted in descending order by the "correctly_solved" property
    const documents = await usersCollection.find().sort({ correctly_solved: -1 }).limit(10).toArray();

    // Create an array of the names of the students
    const names = documents.map(doc => doc.Name);

    // Create an array of the scores of the students
    const scores = documents.map(doc => doc.correctly_solved);

    // Order the students in descending order of score
    const ordered_names = await orderStudents(names, scores);

    // Return the ordered array of student names
    return ordered_names;
}

//---------------------------------------------------------------------------------------------------------------------
async function orderStudents(names, scores) {
    // Declare an empty array to hold the ordered student names and scores
    let ordered_names = []

    // Declare a counter variable to keep track of the current rank
    let counter = 0;

    // Iterate over the names array
    await names.forEach(name => {
        // Increment the counter
        counter++;

        // Push a new object to the "ordered_names" array with the current rank, name, and score
        ordered_names.push({
            "Rank": counter,
            "Name": name,
            "score": scores[counter - 1]
        })
    });

    // Return the "ordered_names" array
    return ordered_names;
}
//----------------------------------------------------------------------------------------------------------------------
/***************************************************** Dashboard ******************************************************/
//----------------------------------------------------------------------------------------------------------------------
/*
* As an admin of Madrasa,
* you will have access to a powerful dashboard feature in the flashcards learning tool that provides you with a wealth of information about your students and the words in each lesson.
* With this feature, you can see which words they are having difficulty with.
* You can also see how often each word is being used in the lessons, which can help you identify trends and areas for improvement.
* Overall, the dashboard feature is a valuable resource for Madrasa admins,
* giving you the insights you need to support your students and ensure their success.
*/
//----------------------------------------------------------------------------------------------------------------------
async function getDifficultWords(lesson) {
    // Retrieve the top 10 documents with the specified "lesson" level and a "hitrate" greater than or equal to 0, sorted in ascending order by the "hitrate" property
    topTenWords = await wordsCollection.find({ lesson: lesson, hitrate: { $gte: 0 } })
        .sort({ hitrate: 1 })
        .limit(10)
        .toArray();

    return topTenWords;
}
//---------------------------------------------------------------------------------------------------------------------
async function getGlobalDifficultWords() {
    // Retrieve the top 10 all documents with a "hitrate" greater than or equal to 0, sorted in ascending order by the "hitrate" property (without the lesson constraint)
    topTenWords = await wordsCollection.find({ hitrate: { $gte: 0 } })
        .sort({ hitrate: 1 })
        .limit(10)
        .toArray();

    return topTenWords;
}
//---------------------------------------------------------------------------------------------------------------------
async function getEasyWords(lesson) {
    // Retrieve the top 10 documents with the specified "lesson" level and a "hitrate" greater than or equal to 0, sorted in descending order by the "hitrate" property
    topTenWords = await wordsCollection.find({ lesson: lesson, hitrate: { $gte: 0 } })
        .sort({ hitrate: -1 })
        .limit(10)
        .toArray();

    return topTenWords;
}

//---------------------------------------------------------------------------------------------------------------------
async function getGlobalEasyWords() {
    // Retrieve the top 10 all documents with a "hitrate" greater than or equal to 0, sorted in descending order by the "hitrate" property (without the lesson constraint)
    topTenWords = await wordsCollection.find({ hitrate: { $gte: 0 } })
        .sort({ hitrate: -1 })
        .limit(10)
        .toArray();
    return topTenWords;
}
//---------------------------------------------------------------------------------------------------------------------
async function getAverageLeitnersHitrate() {
    const cursor = await usersCollection.aggregate([
        {
            $match: {
                LeitnersHitRate: { $ne: -1 }
            }
        },
        {
            $group: {
                _id: null,
                avgLeitnersHitrate: { $avg: "$LeitnersHitRate" }
            }
        }
    ])
    const results = await cursor.toArray();
    if (results.length > 0) {
        return results[0].avgLeitnersHitrate;
    } else {
        return 0;
    }
}
//---------------------------------------------------------------------------------------------------------------------
app.get('/dashboard/avgLeitnersHitrate', async (req, res) => {
    let x = await getAverageLeitnersHitrate()
    res.json({ "avg hitrate of words generated by Leitner's system": x })
});
//---------------------------------------------------------------------------------------------------------------------
app.get('/dashboard/difficultwords/lesson/:lesson_number', async (req, res) => {
    let tenWords = []
    // Retrieve the top ten difficult words for the specified lesson level
    tenWords = await getDifficultWords(Number(req.params.lesson_number));
    res.json(tenWords);
});
//---------------------------------------------------------------------------------------------------------------------
app.get('/dashboard/easywords/lesson/:lesson_number', async (req, res) => {
    let tenWords = []
    // Retrieve the top ten easy words for the specified lesson level
    tenWords = await getEasyWords(Number(req.params.lesson_number));
    res.json(tenWords);
});
//---------------------------------------------------------------------------------------------------------------------
app.get('/dashboard/globaleasywords', async (req, res) => {
    let tenWords = []
    // Retrieve the top ten easy words without a lesson constraint
    tenWords = await getGlobalEasyWords();
    res.json(tenWords);
});
//---------------------------------------------------------------------------------------------------------------------
app.get('/dashboard/globaldifficultwords', async (req, res) => {
    let tenWords = []
    // Retrieve the top ten difficult words without a lesson constraint
    tenWords = await getGlobalDifficultWords();
    res.json(tenWords);
});
//---------------------------------------------------------------------------------------------------------------------
app.put('/dashboard/addword/id/:id/arabic/:arabic/hebrew/:hebrew/lesson/:lesson/unit/:unit/part_of_speech/:part_of_speech/audio/:audio/arabic_stt/:arabic_stt',
    async (req, res) => {
        // Extract the values of the request parameters
        const id = Number(req.params.id);
        const arabic = req.params.arabic;
        const hebrew = req.params.hebrew;
        const lesson = Number(req.params.lesson);
        const unit = Number(req.params.unit);
        const part_of_speech = req.params.part_of_speech;
        const audio = req.params.audio;
        const arabic_stt = req.params.arabic_stt;
        const correctly_answered = 0;
        const times_appeared = 0;
        const hitrate = -1;

        // Insert a new document with the extracted and initialized values into the "wordsCollection"
        await wordsCollection.insertOne({
            id: id,
            arabic: arabic,
            hebrew: hebrew,
            lesson: lesson,
            unit: unit,
            part_of_speech: part_of_speech,
            audio: audio,
            arabic_stt: arabic_stt,
            correctly_answered: correctly_answered,
            times_appeared: times_appeared,
            hitrate: hitrate
        });
        res.send("Word added successfully!");
    });
//---------------------------------------------------------------------------------------------------------------------
// To add:
// 4- for each students we save the num of correct questions answered out of the given 10 (array)
//-----------------------------------------------TESTING FUNCTIONS-----------------------------------------------------
//-------------------------------------------------DO NOT SUBMIT-----------------------------------------------------
app.get('/', async (req, res) => {
    await wordsCollection.updateMany({}, { $set: { correctly_answered: 0, times_appeared: 0, hitrate: -1 } })
    res.send("UPDATED");
}
);
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
