# API endpoints

## User Endpoints

`GET /username/{name}/level/{user_level}`

Returns the list of words for the given user at the specified level.

`GET /username/{name}/level/{user_level}/without_wrong_answers`

Returns the list of words for the given user at the specified level, excluding the wrong answers array.

`PUT /username/{name}/wordId/{id}/result/{isRight}`

Updates the result of answering a word for the specified user.

## Leaderboard Endpoint

`GET /leaderboard`

Returns the leaderboard with the top users and their scores.

## Admin Dashboard Endpoints

`GET /dashboard/avgLeitnersHitrate`

Returns the average Leitner's hit rate across all users.

`GET /dashboard/difficultwords/lesson/{lesson_number}`

Returns the list of difficult words for the specified lesson number.

`GET /dashboard/easywords/lesson/{lesson_number}`

Returns the list of easy words for the specified lesson number.

`GET /dashboard/globaleasywords/`

Returns the list of global easy words.

`GET /dashboard/globaldifficultwords/`

Returns the list of global difficult words.
