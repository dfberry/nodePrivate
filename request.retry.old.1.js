var request = require("requestretry");
var async = require('async');
var fs = require('fs-extra');
var moment = require('moment');
var path = require("path");
var version = require("./version");

var appIds = [];
var appResponses = [];
var versionUrls  = [];
var versionUrlsResponses  = [];

var programmaticKey = "fb3488ba06614b4985c1baa7a0af0376";
//v-geberr //"e237d6bc86cd4562bf67b09dff44d2e6";

var myAppList = function(cb) {

  var retryStrategy = function (err, response, body){
    let shouldRetry = err || (response.statusCode === 429);
    return shouldRetry;
  }

  let requestOptions = {
    method:"GET",
    url: "https://westus.api.cognitive.microsoft.com/luis/api/v2.0/apps?take=500",
    headers: {
      "Ocp-Apim-Subscription-Key":programmaticKey
    },
    maxAttempts: 5,   
    retryDelay: 500, 
    retryStrategy:  retryStrategy
  };

  request(requestOptions, function(err, response, body){
    let json = JSON.parse(response.body);
    // this callback will only be called when the request succeeded or after maxAttempts or on error 
    if (response && response.statusCode === 200){
      
      if(Array.isArray(json) && json[0].hasOwnProperty('id')) {
      //console.log('The number of request attempts: ' + response.attempts);
        var urls = [];
        appIds = json.map(x => x.id);
        appIds.forEach(id => {
          urls.push({appId:id,url: ("https://westus.api.cognitive.microsoft.com/luis/api/v2.0/apps/" + id), "Ocp-Apim-Subscription-Key":programmaticKey, route: "app"});
          urls.push({appId:id,url: ("https://westus.api.cognitive.microsoft.com/luis/api/v2.0/apps/" + id + "/versions?take=500"), "Ocp-Apim-Subscription-Key":programmaticKey, route: "app_versions"});
          urls.push({appId:id,url: ("https://westus.api.cognitive.microsoft.com/luis/api/v2.0/apps/" + id + "/settings"), "Ocp-Apim-Subscription-Key":programmaticKey, route: "app_settings"});
          urls.push({appId:id,url: ("https://westus.api.cognitive.microsoft.com/luis/api/v2.0/apps/" + id + "/endpoints"), "Ocp-Apim-Subscription-Key":programmaticKey, route: "app_endpoints"});
        });
        json.urls = urls;
      }
    }
    cb(json);
  });
}

let appInfos = [];

var myRequestApp = function (eachUrlObj, done) {
  var now = new moment();
  console.log("request " + now.format("HH:mm:ss"));
  setTimeout(function () {
    let requestOptions = {
      method:"GET",
      url: eachUrlObj.url,
      headers: {
        "Ocp-Apim-Subscription-Key":programmaticKey
      }
    };
    request(requestOptions, function(error, response, body) { 

      console.log("response " + response.request.href + " " + response.statusCode);

      let json = JSON.parse(body);
      let route = response.request.href.substr(response.request.href.lastIndexOf('/') + 1);

      let myresponse = {
        "Ocp-Apim-Subscription-Key":programmaticKey,
        appId: eachUrlObj.appId,
        route: route,
        name: json.name,
        url: response.request.href, 
        status: response.statusCode, 
        body: json
      };

      appResponses.push(myresponse);
        
      done();
    });
  }, 500);
}


var myRequestAppVersions = function (eachUrlObj, done) {
  version.getVersionsAPI(programmaticKey, eachUrlObj.appId, (results) => {
    done(results);
  });
}


var writeMyFilePromise = function(fileName,data){
  console.log("about to write " + fileName);
  return fs.writeFile(fileName,JSON.stringify(data),"utf-8");
}

myAppList( (appUrls) => {

  // apps
  async.eachSeries(appUrls.urls, myRequestApp, (response) => {

    // each app
    appResponses.forEach(appResponse => {
      if (appResponse.route.indexOf("versions")!= -1){

        // add version urls 
        appResponse.body.forEach(version => {
          // each version url
          versionUrls.push({applicationId: appResponse.appId, version:version.version,info:JSON.parse(JSON.stringify(version)), url: `https://westus.api.cognitive.microsoft.com/luis/api/v2.0/apps/${appResponse.appId}/versions/${version.version}/export`, "Ocp-Apim-Subscription-Key":programmaticKey});
        });
      }
    }); 
    //console.log("about to query versions");
    async.eachSeries(versionUrls, myRequestAppVersions, (versionsResponse) => {

      writeMyFilePromise(path.join(__dirname,"app.json"), appUrls)
      .then( () => {
        return writeMyFilePromise(path.join(__dirname,"appResponses.json"), appResponses);
      }).then( () => {
        return writeMyFilePromise(path.join(__dirname,"versions.json"), versionUrls);
      }).then( () => {
        return writeMyFilePromise(path.join(__dirname,"versionResponses.json"), versionUrlsResponses);
      }).then( () => {
        console.log("done");
      }).catch( (err) => {
        console.log(err);
      });

    });
  });
});




