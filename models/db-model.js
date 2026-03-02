import { dbGet } from "../middleware/db-config.js";

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
    const exists = await this.urlExists();
    if (exists) return null;
    return this.storeAny();
  }

  //-----------

  //UPDATES STUFF

  async updateObjItem() {
    const { keyToLookup, itemValue, updateObj } = this.dataObject;
    const updateData = await dbGet().collection(this.collection).updateOne({ [keyToLookup]: itemValue }, { $set: { ...updateObj } }); //prettier-ignore
    return updateData;
  }

  async updateArrayNested() {
    const { docKey, docValue, updateKey, updateArray } = this.dataObject;
    const updateData = await dbGet().collection(this.collection).updateOne({ [docKey]: docValue }, { $set: { [updateKey]: updateArray } }); //prettier-ignore
    return updateData;
  }

  //--------------

  //GETS STUFF

  async getAll() {
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
    const dataArray = await dbGet().collection(this.collection).find().sort({ [keyToLookup]: -1 }).limit(howMany).toArray(); //prettier-ignore
    return dataArray;
  }

  //-------------

  //CHECK STUFF

  async urlExists() {
    const alreadyStored = await dbGet().collection(this.collection).findOne({ url: this.dataObject.url });
    return alreadyStored;
  }

  async itemExistsCheckBoolean() {
    const { keyToLookup, itemValue } = this.dataObject;
    const itemExists = await dbGet().collection(this.collection).findOne({ [keyToLookup]: itemValue }); //prettier-ignore
    if (!itemExists) return false;
    return true;
  }

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

  //-------------

  //ATOMIC ID GENERATION

  async nextId() {
    const { idKey } = this.dataObject;
    const existing = await dbGet().collection("counters").findOne({ _id: this.collection });
    if (!existing) {
      const maxDoc = await dbGet().collection(this.collection)
        .find().sort({ [idKey]: -1 }).limit(1).toArray();
      const seed = maxDoc?.[0]?.[idKey] ?? 0;
      await dbGet().collection("counters").updateOne(
        { _id: this.collection },
        { $setOnInsert: { seq: seed } },
        { upsert: true }
      );
    }
    const result = await dbGet().collection("counters").findOneAndUpdate(
      { _id: this.collection },
      { $inc: { seq: 1 } },
      { returnDocument: "after" }
    );
    return result.seq;
  }
}

export default dbModel;
