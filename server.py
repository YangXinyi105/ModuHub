import json
import os
import random
import re
import threading
import urllib.parse
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent
DATA_FILE = ROOT_DIR / 'backend' / 'data.json'
VALID_MODULE_QUERIES = ['math101', 'advanced mathematics']
DATA_LOCK = threading.Lock()
DEFAULT_PLACEHOLDER_IMAGE = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><rect width='400' height='300' fill='%23d1d5db'/><g fill='%239ca3af'><rect x='120' y='100' width='160' height='100' rx='12'/><circle cx='165' cy='138' r='18'/><path d='M140 185l35-32 28 24 27-20 30 28z'/></g></svg>"
DEFAULT_GENERAL_ITEMS = [
    {
        'id': 'item_general_1',
        'title': 'iPad Air (Near New, 10.9")',
        'description': 'High-quality iPad Air in near new condition with minimal signs of use. Includes original box and charger.',
        'price': 420,
        'image': 'images/1.png',
        'seller': 'Zhang',
        'sellerId': '100003',
        'postedDate': '2026-03-27T08:00:00',
        'market': 'general',
        'courseCode': ''
    },
    {
        'id': 'item_general_2',
        'title': 'Introduction to Algorithms (CLRS)',
        'description': 'Classic computer science textbook with notes inside. Great for algorithms and data structures.',
        'price': 35,
        'image': 'images/2.png',
        'seller': 'Li',
        'sellerId': '100004',
        'postedDate': '2026-03-27T15:30:00',
        'market': 'general',
        'courseCode': ''
    },
    {
        'id': 'item_general_3',
        'title': 'Logitech MX Master 3 Mouse',
        'description': 'Professional-grade wireless mouse with customizable buttons and advanced tracking.',
        'price': 65,
        'image': 'images/3.png',
        'seller': 'Wang',
        'sellerId': '100005',
        'postedDate': '2026-03-28T07:00:00',
        'market': 'general',
        'courseCode': ''
    }
]
DEFAULT_MODULE_REVIEWERS = [
    {
        'name': 'Yang Xinyi',
        'initial': 'Y',
        'school': 'Hubei University (HUBU)',
        'gender': 'Female',
        'grade': 'Year 2',
        'dorm': '12',
        'likes': 458
    },
    {
        'name': 'Hu Jiatao',
        'initial': 'H',
        'school': 'Hubei University (HUBU)',
        'gender': 'Male',
        'grade': 'Year 2',
        'dorm': '8',
        'likes': 210
    }
]
DEFAULT_MODULE_REVIEWS = [
    {
        'id': 'review_seed_1',
        'courseKey': 'math101',
        'courseLabel': 'Advanced Mathematics',
        'authorName': 'Yang Xinyi',
        'authorInitial': 'Y',
        'authorSchool': 'Hubei University (HUBU)',
        'authorGender': 'Female',
        'authorGrade': 'Year 2',
        'authorDorm': '12',
        'likes': 245,
        'rating': 4,
        'content': 'Calculus is a nightmare if you skip classes! The professor REALLY deducts 5 points if you are late. Buying a secondhand textbook with previous notes highlighted saved my life.',
        'takenYear': '2025',
        'createdAt': '2026-03-20T10:00:00'
    },
    {
        'id': 'review_seed_2',
        'courseKey': 'math101',
        'courseLabel': 'Advanced Mathematics',
        'authorName': 'Hu Jiatao',
        'authorInitial': 'H',
        'authorSchool': 'Hubei University (HUBU)',
        'authorGender': 'Male',
        'authorGrade': 'Year 2',
        'authorDorm': '8',
        'likes': 189,
        'rating': 3,
        'content': 'Pay attention to the proof formats. If you skip steps in the exam, you get zero points even if the final answer is right. Highly recommend grabbing the study guide here.',
        'takenYear': '2025',
        'createdAt': '2026-03-21T14:00:00'
    }
]


def normalize_course_query(query):
    value = (query or '').strip().lower()
    if value in ('math101', 'advanced mathematics'):
        return 'math101'
    return value


def tokenize_text(value):
    return [token for token in re.findall(r'[a-z0-9]+', (value or '').lower()) if len(token) > 1]


def text_matches_query(query, *parts):
    query_tokens = tokenize_text(query)
    if not query_tokens:
        return False

    haystack = ' '.join(str(part or '') for part in parts).lower()
    return all(token in haystack for token in query_tokens)


def build_module_payload(query, data):
    raw_query = (query or '').strip()
    course_key = normalize_course_query(raw_query)
    is_exact_known = raw_query.lower() in ('math101', 'advanced mathematics')
    reviews = list(data.get('moduleReviews') or DEFAULT_MODULE_REVIEWS)
    if is_exact_known:
        known_reviews = [review for review in reviews if review.get('courseKey') == 'math101']
        known_items = [
            serialize_market_item(item, data)
            for item in data['items']
            if item.get('market') == 'module' and normalize_course_query(item.get('courseCode', '')) == 'math101'
        ]
        module = {
            'code': 'MATH101',
            'name': 'Advanced Mathematics',
            'courseKey': 'math101',
            'hasAiInsights': True,
            'requirements': [
                'High Difficulty: The professor frequently checks textbook notes during class.',
                'Strict Attendance: Random roll calls. -5 points from final grade for each late arrival.',
                'Exam Formatting: Must strictly follow the step-by-step proofs taught in class or lose marks.'
            ],
            'assessment': [
                {'label': 'Attendance & Homework', 'value': 30, 'color': 'bg-blue-500'},
                {'label': 'Midterm Exam', 'value': 30, 'color': 'bg-purple-500'},
                {'label': 'Final Exam', 'value': 40, 'color': 'bg-orange-500'}
            ],
            'rating': 3.5,
            'difficulty': 'Hard'
        }
        module['reviews'] = known_reviews
        module['marketItems'] = known_items
        return module
    else:
        clean_label = raw_query.strip() or 'This Module'
        module = {
            'code': raw_query.upper() if raw_query and ' ' not in raw_query else '',
            'name': clean_label,
            'courseKey': course_key,
            'hasAiInsights': False,
            'requirements': [],
            'assessment': [],
            'rating': 0,
            'difficulty': 'Unrated'
        }
        module['reviews'] = []
        module['marketItems'] = []
    return module


def read_data():
    with DATA_LOCK:
        with DATA_FILE.open('r', encoding='utf-8') as file:
            return json.load(file)


def write_data(data):
    with DATA_LOCK:
        with DATA_FILE.open('w', encoding='utf-8') as file:
            json.dump(data, file, ensure_ascii=False, indent=2)


def compute_posted_items(user_name, data):
    item_count = sum(1 for item in data['items'] if item.get('seller') == user_name)
    request_count = sum(1 for request in data['requests'] if request.get('requester') == user_name)
    return item_count + request_count


def serialize_user(user, data):
    return {
        'id': user['id'],
        'name': user['name'],
        'initial': user.get('initial') or user['name'][:1].upper(),
        'school': user.get('school', ''),
        'major': user.get('major', ''),
        'bio': user.get('bio', ''),
        'gender': user.get('gender', 'Not Set'),
        'grade': user.get('grade', 'Not Set'),
        'dorm': user.get('dorm', 'Not Set'),
        'likes': user.get('likes', 0),
        'postedItems': compute_posted_items(user['name'], data)
    }


def serialize_market_item(item, data):
    seller_name = item.get('seller')
    seller_id = item.get('sellerId')

    if seller_id and not seller_name:
        seller = next((user for user in data['users'] if user['id'] == seller_id), None)
        seller_name = seller['name'] if seller else 'Unknown'
    else:
        seller = next((user for user in data['users'] if user['name'] == seller_name), None)
        if seller and not seller_id:
            seller_id = seller['id']

    return {
        'id': item['id'],
        'title': item['title'],
        'description': item['description'],
        'price': item['price'],
        'image': item.get('image', ''),
        'seller': seller_name or 'Unknown',
        'sellerId': seller_id,
        'sellerDorm': seller.get('dorm', 'Not Set') if seller else 'Not Set',
        'postedDate': item.get('postedDate', ''),
        'market': item.get('market', 'general'),
        'courseCode': item.get('courseCode', '')
    }


def serialize_request(request, data):
    requester_id = request.get('requesterId')
    requester_name = request.get('requester')

    if requester_id and not requester_name:
        requester = next((user for user in data['users'] if user['id'] == requester_id), None)
        requester_name = requester['name'] if requester else 'Unknown'
    else:
        requester = next((user for user in data['users'] if user['name'] == requester_name), None)
        if requester and not requester_id:
            requester_id = requester['id']

    return {
        'id': request['id'],
        'title': request['title'],
        'description': request['description'],
        'requester': requester_name or 'Unknown',
        'requesterId': requester_id,
        'postedDate': request.get('postedDate', ''),
        'responses': int(request.get('responses', 0)),
        'status': request.get('status', 'ACTIVE')
    }


def serialize_state(data):
    items = list(data['items'])
    if not any(item.get('market') == 'general' for item in items):
        items = DEFAULT_GENERAL_ITEMS + items

    return {
        'users': [serialize_user(user, data) for user in data['users']],
        'marketItems': [serialize_market_item(item, data) for item in items],
        'requests': [serialize_request(request, data) for request in data['requests']],
        'modules': VALID_MODULE_QUERIES
    }


def parse_json_body(handler):
    length = int(handler.headers.get('Content-Length', '0'))
    raw = handler.rfile.read(length) if length else b'{}'
    try:
        return json.loads(raw.decode('utf-8'))
    except json.JSONDecodeError as error:
        raise ValueError('Invalid JSON body') from error


def normalize_school(value):
    school_map = {
        'HUBU': 'Hubei University (HUBU)',
        'WHU': 'Wuhan University (WHU)',
        'HUST': 'Huazhong Univ. of Sci. & Tech. (HUST)',
        'WUST': 'Wuhan Univ. of Sci. & Tech. (WUST)'
    }
    return school_map.get(value, value)


def create_random_id(prefix, existing_ids):
    existing = set(existing_ids)
    while True:
        suffix = random.randint(100000, 999999)
        value = f'{prefix}{suffix}'
        if value not in existing:
            return value


class ModuHubHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        super().end_headers()

    def log_message(self, format, *args):
        print('[ModuHub]', format % args)

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith('/api/'):
            self.handle_api_get(parsed)
            return
        if parsed.path in ('', '/'):
            self.path = '/index.html'
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if not parsed.path.startswith('/api/'):
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        self.handle_api_post(parsed)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        if not parsed.path.startswith('/api/'):
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        self.handle_api_delete(parsed)

    def send_json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_json_error(self, message, status=HTTPStatus.BAD_REQUEST):
        self.send_json({'error': message}, status=status)

    def handle_api_get(self, parsed):
        data = read_data()
        query = urllib.parse.parse_qs(parsed.query)

        if parsed.path == '/api/bootstrap':
            self.send_json(serialize_state(data))
            return

        if parsed.path == '/api/modules/search':
            keyword = (query.get('q', [''])[0] or '').strip().lower()
            if not keyword:
                self.send_json({'module': None, 'query': keyword})
                return

            self.send_json({'module': build_module_payload(keyword, data), 'query': keyword})
            return

        if parsed.path == '/api/market-items':
            self.send_json([serialize_market_item(item, data) for item in data['items']])
            return

        if parsed.path == '/api/requests':
            self.send_json([serialize_request(request, data) for request in data['requests']])
            return

        self.send_json_error('Unknown endpoint.', HTTPStatus.NOT_FOUND)

    def handle_api_post(self, parsed):
        try:
            payload = parse_json_body(self)
        except ValueError as error:
            self.send_json_error(str(error))
            return

        data = read_data()

        if parsed.path == '/api/auth/register':
            required_fields = ['name', 'schoolKey', 'major', 'gender', 'grade', 'password', 'confirmPassword']
            if any(not str(payload.get(field, '')).strip() for field in required_fields):
                self.send_json_error('Please fill in all required fields.')
                return
            if payload['password'] != payload['confirmPassword']:
                self.send_json_error('Passwords do not match.')
                return
            if len(payload['password']) < 6:
                self.send_json_error('Password must be at least 6 characters long.')
                return

            name = payload['name'].strip()
            if any(user['name'].lower() == name.lower() for user in data['users']):
                self.send_json_error('This username is already registered.')
                return

            user = {
                'id': create_random_id('', [user['id'] for user in data['users']]),
                'name': name,
                'initial': name[:1].upper(),
                'school': normalize_school(payload['schoolKey']),
                'major': payload['major'].strip(),
                'bio': str(payload.get('bio', '')).strip(),
                'gender': payload['gender'],
                'grade': payload['grade'],
                'dorm': payload.get('dorm', '').strip() or 'Not Set',
                'password': payload['password'],
                'likes': 0
            }
            data['users'].append(user)
            write_data(data)
            self.send_json({'message': 'Registration successful.', 'user': serialize_user(user, data), 'state': serialize_state(data)}, status=HTTPStatus.CREATED)
            return

        if parsed.path == '/api/auth/login':
            user_id = str(payload.get('userId', '')).strip()
            password = str(payload.get('password', '')).strip()
            user = next((user for user in data['users'] if user['id'] == user_id and user['password'] == password), None)
            if not user:
                self.send_json_error('Invalid ID or password.', HTTPStatus.UNAUTHORIZED)
                return
            self.send_json({'message': 'Login successful.', 'user': serialize_user(user, data), 'state': serialize_state(data)})
            return

        if parsed.path == '/api/market-items':
            required_fields = ['title', 'description', 'price', 'sellerId', 'market']
            if any(payload.get(field, '') in ('', None) for field in required_fields):
                self.send_json_error('Missing item fields.')
                return

            seller = next((user for user in data['users'] if user['id'] == str(payload['sellerId']).strip()), None)
            if not seller:
                self.send_json_error('Seller not found.', HTTPStatus.NOT_FOUND)
                return

            item = {
                'id': create_random_id('item_', [item['id'] for item in data['items']]),
                'title': str(payload['title']).strip(),
                'description': str(payload['description']).strip(),
                'price': float(payload['price']),
                'image': str(payload.get('image') or '').strip() or DEFAULT_PLACEHOLDER_IMAGE,
                'seller': seller['name'],
                'sellerId': seller['id'],
                'postedDate': str(payload.get('postedDate') or ''),
                'market': str(payload['market']).strip(),
                'courseCode': str(payload.get('courseCode') or '').strip()
            }
            data['items'].insert(0, item)
            write_data(data)
            self.send_json({'message': 'Item posted successfully.', 'item': serialize_market_item(item, data), 'state': serialize_state(data)}, status=HTTPStatus.CREATED)
            return

        if parsed.path == '/api/requests':
            required_fields = ['title', 'description', 'requesterId']
            if any(not str(payload.get(field, '')).strip() for field in required_fields):
                self.send_json_error('Missing request fields.')
                return

            requester = next((user for user in data['users'] if user['id'] == str(payload['requesterId']).strip()), None)
            if not requester:
                self.send_json_error('Requester not found.', HTTPStatus.NOT_FOUND)
                return

            request = {
                'id': create_random_id('req_', [request['id'] for request in data['requests']]),
                'title': str(payload['title']).strip(),
                'description': str(payload['description']).strip(),
                'requester': requester['name'],
                'requesterId': requester['id'],
                'postedDate': str(payload.get('postedDate') or ''),
                'responses': int(payload.get('responses', 0)),
                'status': 'ACTIVE'
            }
            data['requests'].insert(0, request)
            write_data(data)
            self.send_json({'message': 'Request posted successfully.', 'request': serialize_request(request, data), 'state': serialize_state(data)}, status=HTTPStatus.CREATED)
            return

        if parsed.path == '/api/module-reviews':
            required_fields = ['courseKey', 'content', 'rating', 'authorId']
            if any(not str(payload.get(field, '')).strip() for field in required_fields):
                self.send_json_error('Missing review fields.')
                return

            author = next((user for user in data['users'] if user['id'] == str(payload['authorId']).strip()), None)
            if not author:
                self.send_json_error('Author not found.', HTTPStatus.NOT_FOUND)
                return

            if 'moduleReviews' not in data:
                data['moduleReviews'] = list(DEFAULT_MODULE_REVIEWS)

            review = {
                'id': create_random_id('review_', [review['id'] for review in data['moduleReviews']]),
                'courseKey': normalize_course_query(payload['courseKey']),
                'courseLabel': str(payload.get('courseLabel') or payload['courseKey']).strip(),
                'authorName': author['name'],
                'authorInitial': author.get('initial') or author['name'][:1].upper(),
                'authorSchool': author.get('school', ''),
                'authorMajor': author.get('major', 'Not Set'),
                'authorGender': author.get('gender', 'Not Set'),
                'authorGrade': author.get('grade', 'Not Set'),
                'authorDorm': author.get('dorm', 'Not Set'),
                'likes': 0,
                'rating': int(payload['rating']),
                'content': str(payload['content']).strip(),
                'takenYear': str(payload.get('takenYear') or '2026').strip(),
                'createdAt': str(payload.get('createdAt') or '')
            }
            data['moduleReviews'].insert(0, review)
            write_data(data)
            self.send_json(
                {
                    'message': 'Review posted successfully.',
                    'review': review,
                    'module': build_module_payload(payload['courseKey'], data)
                },
                status=HTTPStatus.CREATED
            )
            return

        self.send_json_error('Unknown endpoint.', HTTPStatus.NOT_FOUND)

    def handle_api_delete(self, parsed):
        match = re.fullmatch(r'/api/requests/([^/]+)', parsed.path)
        if not match:
            self.send_json_error('Unknown endpoint.', HTTPStatus.NOT_FOUND)
            return

        request_id = urllib.parse.unquote(match.group(1))
        requester_id = urllib.parse.parse_qs(parsed.query).get('requesterId', [''])[0]
        data = read_data()
        existing_request = next((request for request in data['requests'] if request['id'] == request_id), None)
        if not existing_request:
            self.send_json_error('Request not found.', HTTPStatus.NOT_FOUND)
            return
        if requester_id and existing_request.get('requesterId') != requester_id:
            self.send_json_error('You can only withdraw your own request.', HTTPStatus.FORBIDDEN)
            return

        data['requests'] = [request for request in data['requests'] if request['id'] != request_id]

        write_data(data)
        self.send_json({'message': 'Request withdrawn successfully.', 'state': serialize_state(data)})


if __name__ == '__main__':
    port = int(os.environ.get('PORT', '8000'))
    server = ThreadingHTTPServer(('127.0.0.1', port), ModuHubHandler)
    print(f'ModuHub server running at http://127.0.0.1:{port}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopping server...')
    finally:
        server.server_close()
