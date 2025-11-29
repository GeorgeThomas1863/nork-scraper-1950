import dbModel from "../../models/db-model.js";
import kcnaState from "./state.js";

export const buildNumericId = async (itemType) => {
  if (!itemType) return null;

  const prefix = itemType.slice(0, -1);
  const keyToLookup = `${prefix}Id`;

  const nextId = await getNextId(keyToLookup, itemType);
  return nextId;
};

export const getNextId = async (keyToLookup, itemType) => {
  const collectionName = itemType + "Collection";

  console.log("COLLECTION NAME");
  console.log(collectionName); 
  console.log("KEY TO LOOKUP");
  console.log(keyToLookup);
  console.log("ITEM TYPE");
  console.log(itemType);

  const dataModel = new dbModel({ keyToLookup: keyToLookup }, collectionName);
  const maxId = await dataModel.findMaxId();

  console.log("MAX ID");
  console.log(maxId);

  if (!maxId) return 1;

  return maxId + 1;
};

//-------------------------------

export const extractItemDate = async (linkElement) => {
  const { scrapeStartTime } = kcnaState;
  if (!linkElement) return null;

  const dateElement = linkElement.querySelector(".publish-time");
  if (!dateElement) return null;

  //extract dateText
  const dateRaw = dateElement.textContent.trim();
  if (!dateRaw) return null;
  const dateText = dateRaw.replace(/[\[\]]/g, "");

  // Convert the date string (YYYY.MM.DD) to a JavaScript Date object, then split to arr
  const dateArr = dateText.split(".");
  const year = parseInt(dateArr[0]);
  // JS months are 0-based (subtract 1 at end)
  const month = parseInt(dateArr[1]);
  const day = parseInt(dateArr[2]);

  // Validate the date; if fucked return null
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

  const normalDate = new Date(year, month - 1, day);

  //if no startTime return just date
  if (!scrapeStartTime) return normalDate;

  const scrapeHour = scrapeStartTime.getHours();
  const scrapeMinute = scrapeStartTime.getMinutes();

  normalDate.setHours(scrapeHour);
  normalDate.setMinutes(scrapeMinute);

  return normalDate;
};
