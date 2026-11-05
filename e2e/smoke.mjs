import assert from 'node:assert/strict';

const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:5000/api';
const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@bookstore.local';
const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'AdminPass123!';

function createCookieJar() {
  return new Map();
}

function readSetCookies(response, jar) {
  const cookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : (response.headers.get('set-cookie') || '').split(/,(?=[^;]+=[^;]+)/);
  for (const cookie of cookies) {
    const [pair] = cookie.split(';');
    const separator = pair.indexOf('=');
    if (separator > 0) jar.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

async function api(path, { jar, method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(jar?.size ? { cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; ') } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (jar) readSetCookies(response, jar);
  const data = response.status === 204 ? null : await response.json();
  return { response, data };
}

const guest = createCookieJar();
const catalogue = await api('/books', { jar: guest });
assert.equal(catalogue.response.status, 200);
assert.ok(catalogue.data.books.length > 0, 'seeded catalogue should not be empty');
const book = catalogue.data.books.find((candidate) => candidate.available);
assert.ok(book, 'seeded catalogue should contain an available book');

const search = await api(`/books?q=${encodeURIComponent(book.author)}`, { jar: guest });
assert.equal(search.response.status, 200);
assert.ok(search.data.books.some((candidate) => candidate.id === book.id));

const customer = createCookieJar();
const uniqueEmail = `smoke-${Date.now()}@example.com`;
const registration = await api('/auth/register', {
  jar: customer,
  method: 'POST',
  body: { name: 'Smoke Reader', email: uniqueEmail, password: 'SmokePass123!' },
});
assert.equal(registration.response.status, 201);

const add = await api('/cart', { jar: customer, method: 'POST', body: { bookId: book.id, quantity: 1 } });
assert.equal(add.response.status, 201);
const itemId = add.data.cart.items[0].itemId;
const update = await api(`/cart/${itemId}`, { jar: customer, method: 'PATCH', body: { quantity: 2 } });
assert.equal(update.response.status, 200);
const remove = await api(`/cart/${itemId}`, { jar: customer, method: 'DELETE' });
assert.equal(remove.response.status, 200);

const customerAdminAttempt = await api('/admin/books', { jar: customer });
assert.equal(customerAdminAttempt.response.status, 403);

const admin = createCookieJar();
const login = await api('/auth/login', { jar: admin, method: 'POST', body: { email: adminEmail, password: adminPassword } });
assert.equal(login.response.status, 200);
const categoryName = `Smoke ${Date.now()}`;
const category = await api('/admin/categories', { jar: admin, method: 'POST', body: { name: categoryName } });
assert.equal(category.response.status, 201);
const createdBook = await api('/admin/books', {
  jar: admin,
  method: 'POST',
  body: {
    title: `Smoke Book ${Date.now()}`,
    author: 'Smoke Author',
    price: 9.99,
    stock: 2,
    category: category.data.category.id,
    active: true,
  },
});
assert.equal(createdBook.response.status, 201);
const publicReflection = await api(`/books?q=${encodeURIComponent(createdBook.data.book.title)}`, { jar: guest });
assert.equal(publicReflection.response.status, 200);
assert.equal(publicReflection.data.books[0].id, createdBook.data.book.id);

await api('/auth/logout', { jar: customer, method: 'POST' });
const afterLogout = await api('/cart', { jar: customer });
assert.equal(afterLogout.response.status, 401);

console.log('E2E smoke passed: guest catalogue/search, customer auth/cart, customer RBAC denial and admin catalogue management.');
