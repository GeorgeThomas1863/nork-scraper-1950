//import mongo
import { dbGet, dbConnect } from "../config/db.js";

//connect to db AGAIN here just to be safe
await dbConnect();

//IF HATE SELF REFACTOR INTO EXTENDED CLASSES (one for each functionality / category)

class dbModel {
  constructor(dataObject, collection) {
    this.dataObject = dataObject;
    this.collection = collection;
  }

  //STORE STUFF

  async storeAny() {
    const storeData = await dbGet().collection(this.collection).insertOne(this.dataObject);
    return storeData;
  }

  async storeUniqueURL() {
    const isNew = await this.urlNewCheck(); //check if new
    if (!isNew) return null;

    const storeData = await this.storeAny();
    return storeData;
  }

  async storeArray() {
    //return null on blank input
    const storeArray = [];
    const inputArray = this.dataObject;
    if (!inputArray || !inputArray.length) return null;

    // loop through input array (of OBJs) adding articleId identifier
    for (let i = 0; i < inputArray.length; i++) {
      try {
        const inputObj = inputArray[i];

        //throws error if not unique
        //(claude claims i can instantiate a new instance from within this class)
        const storeModel = new dbModel(inputObj, this.collection);
        const storeData = await storeModel.storeUniqueURL();
        // console.log(storeData);
        storeArray.push(storeData);
      } catch (e) {
        console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
      }
    }

    //just for tracking, not necessary
    return storeArray;
  }

  //-----------

  //UPDATES STUFF

  async updateLog() {
    const { inputObj, scrapeId } = this.dataObject;
    const updateData = await dbGet().collection(this.collection).updateMany({ _id: scrapeId }, { $set: { ...inputObj } }); //prettier-ignore
    return updateData;
  }

  async updateObjItem() {
    const { keyToLookup, itemValue, updateObj } = this.dataObject;
    const updateData = await dbGet().collection(this.collection).updateOne({ [keyToLookup]: itemValue }, { $set: { ...updateObj } }); //prettier-ignore
    return updateData;
  }

  async updateObjInsert() {
    const { keyToLookup, itemValue, insertKey, updateObj } = this.dataObject;
    const updateData = await dbGet().collection(this.collection).updateOne({ [keyToLookup]: itemValue }, { $set: { [insertKey]: updateObj } }); //prettier-ignore
    return updateData;
  }

  async updateArrayNested() {
    const { docKey, docValue, updateKey, updateArray } = this.dataObject;
    const updateData = await dbGet().collection(this.collection).updateOne({ [docKey]: docValue }, { $set: { [updateKey]: updateArray } }); //prettier-ignore
    return updateData;
  }

  // async updateObjNested() {
  //   const { docKey, docValue, nestedKey, nestedValue, updateObj } = this.dataObject;

  //   //removes nested url from picArray
  //   const pullData = await db.dbGet().collection(this.collection).updateOne({ [docKey]: docValue }, { $pull: { picArray: { [nestedKey]: nestedValue } } }); //prettier-ignore
  //   if (!pullData) return null;

  //   //adds new nested obj to picArray
  //   const pushData = await db.dbGet().collection(this.collection).updateOne({ [docKey]: docValue }, { $push: { picArray: { ...updateObj } } }); //prettier-ignore

  //   return pushData;
  // }

  //--------------

  //GETS STUFF

  async getAll() {
    // await db.dbConnect();
    const arrayData = await dbGet().collection(this.collection).find().toArray();
    return arrayData;
  }

  async getUniqueItem() {
    const { keyToLookup, itemValue } = this.dataObject;
    const dataArray = await dbGet().collection(this.collection).findOne({ [keyToLookup]: itemValue }); //prettier-ignore
    return dataArray;
  }

  async getUniqueArray() {
    const { keyToLookup, itemValue } = this.dataObject;
    const dataArray = await dbGet().collection(this.collection).find({ [keyToLookup]: itemValue }).toArray(); //prettier-ignore
    return dataArray;
  }

  async getLastItemsArray() {
    const keyToLookup = this.dataObject.keyToLookup;
    const howMany = +this.dataObject.howMany;

    //get data
    const dataArray = await dbGet().collection(this.collection).find().sort({ [keyToLookup]: -1 }).limit(howMany).toArray(); //prettier-ignore

    return dataArray;
  }

  //-------------

  //CHECK STUFF

  async urlNewCheck() {
    const alreadyStored = await dbGet().collection(this.collection).findOne({ url: this.dataObject.url });

    if (alreadyStored) {
      console.log("URL ALREADY STORED");
      return false;
    }

    //otherwise return true
    return true;
  }

  //non r slur version (logic NOT BACKWARDS)
  async urlExistsCheck() {
    const alreadyStored = await dbGet().collection(this.collection).findOne({ url: this.dataObject.url });

    if (alreadyStored) console.log(`URL ALREADY STORED: ${this.dataObject.url}`);

    return alreadyStored;
  }

  //version that doesnt throw error
  async itemExistsCheckBoolean() {
    const { keyToLookup, itemValue } = this.dataObject;
    const itemExists = await dbGet().collection(this.collection).findOne({ [keyToLookup]: itemValue }); //prettier-ignore
    if (!itemExists) return false;

    return true;
  }

  async findNewURLs() {
    // await db.dbConnect();
    //putting collections in dataObject for no reason, if hate self refactor rest of project like this
    const collection1 = this.dataObject.collection1; //OLD THING (compare against)
    const collection2 = this.dataObject.collection2; //NEW THING (process you are currently doing / handling)

    //run check
    const distinctURLs = await dbGet().collection(collection2).distinct("url");
    const newURLsArray = await dbGet().collection(collection1).find({ ["url"]: { $nin: distinctURLs } }).toArray(); //prettier-ignore
    return newURLsArray;
  }

  async findNewPicsBySize() {
    const collection1 = this.dataObject.collection1; //OLD THING (compare against)
    const collection2 = this.dataObject.collection2; //NEW THING (process you are currently doing / handling)

    // Get all docs from collection1
    const collection1Data = await dbGet().collection(collection1).find().toArray();

    // Create an array to store the matching results
    const docArray = [];

    // Process each document in collection1
    for (const doc of collection1Data) {
      // Check if this URL exists in collection2
      const matchingDoc = await dbGet().collection(collection2).findOne({ url: doc.url });

      // Add to results if: The URL doesn't exist in collection2, or picSize in collection1 is larger than in collection2
      if (!matchingDoc || doc.picSize > matchingDoc.picSize) {
        docArray.push(doc);
      }
    }

    return docArray;
  }

  async findMaxId() {
    const keyToLookup = this.dataObject.keyToLookup;
    const dataObj = await dbGet().collection(this.collection).find().sort({ [keyToLookup]: -1 }).limit(1).toArray(); //prettier-ignore

    if (!dataObj || !dataObj[0]) return null;

    return +dataObj[0][keyToLookup];
  }

  //finds empty items that also have a particular key
  async findEmptyItems() {
    const { keyExists, keyEmpty } = this.dataObject;
    const dataArray = await dbGet()
      .collection(this.collection)
      .find({
        $or: [{ [keyEmpty]: { $exists: false } }, { [keyEmpty]: "" }, { [keyEmpty]: null }, { [keyEmpty]: false }],
        [keyExists]: { $exists: true },
      })
      .toArray();
    return dataArray;
  }

  //finds nested items (for picArray)
  async findEmptyItemsNested() {
    const { keyExists, keyEmpty, arrayKey } = this.dataObject;

    const nestedPath = `${arrayKey}.${keyEmpty}`;
    const dataArray = await dbGet()
      .collection(this.collection)
      .find({ $or: [{ [nestedPath]: { $exists: false } }, { [nestedPath]: "" }, { [nestedPath]: null }], [keyExists]: { $exists: true } })
      .toArray();
    return dataArray;
  }

  //-------------

  //DELETE STUFF

  async deleteItem() {
    const { keyToLookup, itemValue } = this.dataObject;
    const deleteData = await dbGet().collection(this.collection).deleteOne({ [keyToLookup]: itemValue }); //prettier-ignore
    return deleteData;
  }
}

export default dbModel;
