import axios from "axios";

class NORK {
  constructor(dataObject) {
    this.dataObject = dataObject;
  }

  //confirm try catch works
  async getHTML() {
    const inputURL = this.dataObject.url;

    try {
      const res = await axios({
        method: "get",
        url: inputURL,
        timeout: 60000,
        responseType: "text",
      });

      return res.data;
    } catch (e) {
      console.log("ERROR, for " + inputURL);
      console.log(e);
      return null;
    }
  }
}

export default NORK;
