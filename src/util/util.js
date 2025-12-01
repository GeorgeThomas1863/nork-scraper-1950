import dbModel from "../../models/db-model.js";
import kcnaState from "./state.js";
import { articleURLs, picSetURLs } from "../../config/urls.js";

export const calcHowMuchKCNA = async (howMuch, type) => {
  if (!howMuch || !type) return null;

  console.log("CALCULATING HOW MUCH KCNA");
  console.log(howMuch);
  console.log(type);

  let defaultURLs = articleURLs;
  if (type === "picSets") defaultURLs = picSetURLs;

  const dataArray = [];
  for (const typeKey in defaultURLs) {
    if (!kcnaState.scrapeActive) return dataArray;

    const typeArr = defaultURLs[typeKey];
    if (!typeArr || !typeArr.length) continue;
    let itemLength = typeArr.length;
    if (howMuch === "admin-scrape-new" && itemLength > 3) itemLength = 3;

    const returnObj = {
      type: typeKey,
      pageArray: [],
    };

    for (let i = 0; i < itemLength; i++) {
      const pageURL = typeArr[i];
      returnObj.pageArray.push(pageURL);
    }

    dataArray.push(returnObj);
  }

  return dataArray;
};

//---------------------

export const buildNumericId = async (itemType) => {
  if (!itemType) return null;

  const prefix = itemType.slice(0, -1);
  const keyToLookup = `${prefix}Id`;

  const nextId = await getNextId(keyToLookup, itemType);
  return nextId;
};

export const getNextId = async (keyToLookup, itemType) => {
  const dataModel = new dbModel({ keyToLookup: keyToLookup }, itemType);
  const maxId = await dataModel.findMaxId();

  // console.log("MAX ID");
  // console.log(maxId);

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
