import time
import requests
import threading
#-----------------------------------------------------------------------------------------------------------------------
users = ["apple","banana","orange","mango","pear","strawberry","pineapple",
        "avocado","kiwi","peach","plum","pomegranate","guava",
        "cantaloupe","honeydew","watermelon","tomato","potato","onion","garlic","ginger","carrot","celery",
        "cucumber","bellpepper","eggplant","squash","zucchini","lettuce","arugula","broccoli","cauliflower",
        "cabbage","kale","collardgreens","brussels","bokchoy","spinach","mustardgreens","chard",
        "tangerine","lime","lemon","grapefruit","pomelo","mandarin","tangelo","clementine","satsuma","uglifruit",
        "papaya","mangosteen","durian","jackfruit","lychee","longan","rambutan","persimmon","kiwifruit","starfruit",
        "coconut","date","fig","pricklypear","olive","cactusfruit","grapes",
        "raisin","sultana","currant","rowanberry","gooseberry","elderberry",
        "huckleberry","boysenberry","cloudberry","bakeberry","raspberry","blackberry",
        "bilberry","whortleberry","barberry","cranberry","lingonberry"]
#-----------------------------------------------------------------------------------------------------------------------
urls = {
    'leaderboard': "http://localhost:8000/leaderboard",
    'dashboard' : ["http://localhost:8000/dashboard/avgLeitnersHitrate",
                   "http://localhost:8000/dashboard/difficultwords/lesson/8",
                   "http://localhost:8000/dashboard/easywords/lesson/8",
                   "http://localhost:8000/dashboard/globaleasywords",
                   "http://localhost:8000/dashboard/globaldifficultwords"
                   ],
    'update_word' : ["http://localhost:8000/username/*/wordId/#/result/true",
                     "http://localhost:8000/username/*/wordId/#/result/false"],
    'get_words' : ["http://localhost:8000/username/*/level/8/without_wrong_answers",
                   "http://localhost:8000/username/*/level/8"]
    }
#-----------------------------------------------------------------------------------------------------------------------
lock = threading.Lock()

def print_results(msg):
    with lock:
        print(msg)
#-----------------------------------------------------------------------------------------------------------------------
def get_request(url):
    start_time = time.time()
    response = requests.get(url)
    elapsed_time = time.time() - start_time
    res = "PASS" if response.status_code == 200 else "FAIL"
    t = threading.Thread(target=print_results, args=(f"request: {url}: Time taken: {round(elapsed_time,3)} status: {res} ",))
    t.start()
    t.join()
#-----------------------------------------------------------------------------------------------------------------------
def put_request(url):
    start_time = time.time()
    response = requests.put(url)
    elapsed_time = time.time() - start_time
    res = "PASS" if response.status_code == 200 else "FAIL"
    t = threading.Thread(target=print_results, args=(f"request: {url}: Time taken: {round(elapsed_time,3)} status: {res} ",))
    t.start()
    t.join()
#-----------------------------------------------------------------------------------------------------------------------
def create_parallel_get_requests(num,url):
    threads = []
    for _ in range(num):
        t = threading.Thread(target=get_request, args=(url,))
        t.start()
        threads.append(t)

    for t in threads:
        t.join()
#-----------------------------------------------------------------------------------------------------------------------
def create_parallel_put_requests(num,url):
    threads = []
    for _ in range(num):
        t = threading.Thread(target=put_request, args=(url,))
        t.start()
        threads.append(t)

    for t in threads:
        t.join()
#-----------------------------------------------------------------------------------------------------------------------
def multiple_leaderboard_requests(num):
    create_parallel_get_requests(num,urls['leaderboard'])
#-----------------------------------------------------------------------------------------------------------------------
def multiple_dashboard_requests(num):
    for url in urls['dashboard']:
        create_parallel_get_requests(num,url)
#-----------------------------------------------------------------------------------------------------------------------
def multiple_users_update_words(num):
    threads = []
    for i in range(1,num):
        for url in urls['update_word']:
            url = url.replace("*",users[i]).replace("#",str(i))
            t = threading.Thread(target=put_request, args=(url,))
            t.start()
            threads.append(t)

    for t in threads:
        t.join()
#-----------------------------------------------------------------------------------------------------------------------
def multiple_users_get_words(num):
    threads = []
    for i in range(1,num):
        for url in urls['get_words']:
            url = url.replace("*",users[i])
            t = threading.Thread(target=get_request, args=(url,))
            t.start()
            threads.append(t)

    for t in threads:
        t.join()
#-----------------------------------------------------------------------------------------------------------------------
if __name__ == '__main__':
    multiple_users_update_words(len(users))
    multiple_users_get_words(len(users))
    multiple_leaderboard_requests(1000)
    multiple_dashboard_requests(1000)
#-----------------------------------------------------------------------------------------------------------------------
