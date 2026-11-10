import { connectDatabase, disconnectDatabase } from './config/database.js';
import config from './config/env.js';
import { hashPassword } from './modules/authentication-security/password.js';
import { User } from './modules/authentication-security/models/User.js';
import { Book } from './modules/book-catalogue/models/Book.js';
import { Category } from './modules/book-catalogue/models/Category.js';
import { Cart } from './modules/shopping-orders/models/Cart.js';

const categories = [
  { name: 'Fiction', slug: 'fiction', description: 'Stories across contemporary and classic fiction.' },
  { name: 'Technology', slug: 'technology', description: 'Programming, engineering and computer science.' },
  { name: 'Design', slug: 'design', description: 'Visual, product and user experience design.' },
];

const books = [
  {
    title: 'The Midnight Library',
    author: 'Matt Haig',
    description: 'A reflective novel about choices, possibility and the lives between them.',
    keywords: ['fiction', 'life', 'choices'],
    price: 14.99,
    coverUrl: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&w=800&q=80',
    stock: 12,
    active: true,
    category: 'Fiction',
  },
  {
    title: 'Designing Data-Intensive Applications',
    author: 'Martin Kleppmann',
    description: 'Practical foundations for reliable, scalable and maintainable data systems.',
    keywords: ['technology', 'databases', 'distributed systems'],
    price: 42.5,
    coverUrl: 'https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=800&q=80',
    stock: 7,
    active: true,
    category: 'Technology',
  },
  {
    title: 'The Design of Everyday Things',
    author: 'Don Norman',
    description: 'A classic guide to human-centred design and usable products.',
    keywords: ['design', 'ux', 'usability'],
    price: 25,
    coverUrl: 'https://images.unsplash.com/photo-1558655146-d09347e92766?auto=format&fit=crop&w=800&q=80',
    stock: 0,
    active: true,
    category: 'Design',
  },
  {
    title: 'Archived Catalogue Example',
    author: 'Online Bookstore Team',
    description: 'A development seed record used to verify inactive visibility rules.',
    keywords: ['hidden', 'inactive'],
    price: 10,
    coverUrl: '',
    stock: 4,
    active: false,
    category: 'Technology',
  },
];

async function seed() {
  await connectDatabase(config.mongoUri);

  const categoryByName = new Map();
  for (const categoryData of categories) {
    const category = await Category.findOneAndUpdate(
      { slug: categoryData.slug },
      categoryData,
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    categoryByName.set(category.name, category);
  }

  for (const bookData of books) {
    const { category: categoryName, ...bookFields } = bookData;
    await Book.findOneAndUpdate(
      { title: bookData.title, author: bookData.author },
      { ...bookFields, category: categoryByName.get(categoryName)._id },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  const accounts = [
    {
      name: 'Development Admin',
      email: process.env.SEED_ADMIN_EMAIL || 'admin@bookstore.local',
      password: process.env.SEED_ADMIN_PASSWORD || 'AdminPass123!',
      role: 'ADMIN',
    },
    {
      name: 'Development Customer',
      email: process.env.SEED_CUSTOMER_EMAIL || 'customer@bookstore.local',
      password: process.env.SEED_CUSTOMER_PASSWORD || 'CustomerPass123!',
      role: 'CUSTOMER',
    },
  ];

  for (const account of accounts) {
    await User.findOneAndUpdate(
      { email: account.email.toLowerCase() },
      {
        name: account.name,
        email: account.email.toLowerCase(),
        passwordHash: await hashPassword(account.password),
        role: account.role,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  await Cart.deleteMany({});
  console.log(`Seeded ${categories.length} categories, ${books.length} books and ${accounts.length} development accounts.`);
}

try {
  await seed();
} finally {
  await disconnectDatabase();
}
