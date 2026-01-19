require('dotenv').config();

module.exports = {
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
};
