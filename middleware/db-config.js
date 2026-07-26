import { MongoClient } from "mongodb";

let db;
let client;

export const dbConnect = async () => {
  //connect to mongo server
  client = await MongoClient.connect(process.env.MONGO_URI);
  db = client.db(process.env.DB_NAME);
};

//create function to call database outside file
export const dbGet = () => {
  //ensure db connection is working
  if (!db) {
    throw { message: "Database connection fucked" };
  }
  return db;
};

//close connection so one off scripts can exit clean
export const dbClose = async () => {
  if (!client) return;
  await client.close();
  client = null;
  db = null;
};
