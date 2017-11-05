var request = require("requestretry");
var async = require('async');
var fs = require('fs-extra');
var moment = require('moment');
var path = require("path");
var assert = require("assert");
var _ = require("underscore");

var appResponses = [];
var versionUrls  = [];
var versionUrlsResponses  = [];

var programmaticKey = "fb3488ba06614b4985c1baa7a0af0376";

var retryStrategy = function (err, response, body){
  let shouldRetry = err || (response.statusCode === 429);
  return shouldRetry;
}

var myAppList = function(cb) {



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
    let appList = JSON.parse(response.body);
    // this callback will only be called when the request succeeded or after maxAttempts or on error 
    if (response && response.statusCode === 200){
      
      if(Array.isArray(appList) && appList[0].hasOwnProperty('id')) {
      //console.log('The number of request attempts: ' + response.attempts);
        var urls = [];
        //appIds = json.map(x => {
        //  appIds.push({id: x.id, name: x.name};
        //});
        appList.forEach(app => {

          console.log("app " + app.name);

          urls.push({name: app.name,appId:app.id, "Ocp-Apim-Subscription-Key":programmaticKey, route: "appInfo",url: ("https://westus.api.cognitive.microsoft.com/luis/api/v2.0/apps/" + app.id)});
          urls.push({name: app.name,appId:app.id, "Ocp-Apim-Subscription-Key":programmaticKey, route: "versions",url: ("https://westus.api.cognitive.microsoft.com/luis/api/v2.0/apps/" + app.id + "/versions?take=500")});
          urls.push({name: app.name,appId:app.id, "Ocp-Apim-Subscription-Key":programmaticKey, route: "settings",url: ("https://westus.api.cognitive.microsoft.com/luis/api/v2.0/apps/" + app.id + "/settings")});
          urls.push({name: app.name,appId:app.id, "Ocp-Apim-Subscription-Key":programmaticKey, route: "endpoints",url: ("https://westus.api.cognitive.microsoft.com/luis/api/v2.0/apps/" + app.id + "/endpoints")});
        
     
        });
      }
    }
    cb({apps:appList, urls: urls});
  });
}

let appInfos = [];

var myRequestApp = function (eachUrlObj, done) {

  console.log("request app " + eachUrlObj.url + ' ' + new moment().format("HH:mm:ss"));
  setTimeout(function () {
    let requestOptions = {
      method:"GET",
      url: eachUrlObj.url,
      headers: {
        "Ocp-Apim-Subscription-Key":programmaticKey
      },
      maxAttempts: 5,   
      retryDelay: 500, 
      retryStrategy:  retryStrategy
    };
    request(requestOptions, function(error, response, body) { 

      if(error){
        console.log("request err " + eachUrlObj.url);
      }
      console.log("response app " + response.request.href + " " + response.statusCode);

      let json = JSON.parse(body);
      let route = response.request.href.substr(response.request.href.lastIndexOf('/') + 1).replace('?take=500','');

      let myresponse = {
        appId: eachUrlObj.appId,
        route: route,
        name: eachUrlObj.name,
        url: response.request.href, 
        status: response.statusCode, 
        body: json
      };

      appResponses.push(myresponse);
      
      eachUrlObj[route] = {
        //request: requestOptions, 
        response: myresponse, 
        status: response.statusCode};

      done();
    });
  }, 500);
}


var myRequestAppVersions = function (eachUrlObj, done) {


  console.log("request version " + eachUrlObj.version + ' ' + new moment().format("HH:mm:ss"));

    setTimeout(function () {
      let requestOptions = {
        method:"GET",
        url: eachUrlObj.url,
        headers: {
          "Ocp-Apim-Subscription-Key":eachUrlObj["Ocp-Apim-Subscription-Key"]
        },
        maxAttempts: 5,   
        retryDelay: 500, 
        retryStrategy:  retryStrategy
      };
      request(requestOptions, function(error, response, body) { 
  
        console.log("response version " + response.request.href + " " + response.statusCode);
  
        let json = JSON.parse(body);
        let route = response.request.href.substr(response.request.href.lastIndexOf('/') + 1).replace('?take=500','');
  
        let myresponse = {
          appId: eachUrlObj.appId,
          route: route,
          name: json.name,
          url: response.request.href, 
          status: response.statusCode, 
          body: json
        };
  
        versionUrlsResponses.push(myresponse);

        //eachUrlObj.requestOptions = requestOptions;
        eachUrlObj.response = json;
        eachUrlObj.responseStatus = response.statusCode;
        done();
      });
    }, 500);
  }

let getVersionUrls = (progKey, appName, appId, versionList) => {
  versionList.forEach(version => {
    
    // each version url
    versionUrls.push({"Ocp-Apim-Subscription-Key":programmaticKey,name: appName, id: appId, version:version.version,info:JSON.parse(JSON.stringify(version)), url: `https://westus.api.cognitive.microsoft.com/luis/api/v2.0/apps/${appId}/versions/${version.version}/export`});
  });
}

let getVersionInfos = (appUrls, versionUrls,done) => {

    async.eachSeries(versionUrls, myRequestAppVersions, (versionsResponse) => {
      done(versionsResponse);
    });
}


var writeMyFilePromise = function(fileName,data){
  return fs.writeFile(fileName,JSON.stringify(data),"utf-8");
}
var writeAllToFiles = (appUrls) => {

  var promise1 = writeMyFilePromise(path.join(__dirname,"app.json"), appUrls);
 
  return Promise.all([promise1]).then( () => {
    return;
  }).catch( (err) => {
    throw(err);
  });
}

var fixAppList = (appList, children) => {

  appList.forEach(app => {
    var properties = children.filter(x => x.appId === app.id);
    var bodies = properties.map(x => {
      let info = {};
      if (x.route === "appInfo"){
        info = { route: "appInfo", values: x[x.appId].response.body};
      } else {
        info = { route: x.route, values: x[x.route].response.body};
      }
      return info;
    });
    app.properties = bodies;
  });
}

var fixVersionList = (appList, children) => {
  appList.forEach(app => {
    var versionsList = children.filter(x => x.id === app.id);
    var bodies = versionsList.map(x => x.response );
    app.properties.push({ route: "versionExports", values: bodies});
  });

}

myAppList((appUrls) => {


  appUrls.programmaticKey = programmaticKey;

  assert(appUrls.apps.length===5);
  assert(appUrls.urls.length===20);

  async.eachSeries(appUrls.urls, myRequestApp, (response) => {

    assert(appResponses.length===20);
    var appChildrenRoutes = JSON.parse(JSON.stringify(appUrls.urls));
    delete appUrls.urls;
    fixAppList(appUrls.apps, appChildrenRoutes);

    appResponses.forEach(appResponse => {

      if (appResponse.route.indexOf("versions")!= -1){
        getVersionUrls(programmaticKey, appResponse.name, appResponse.appId,appResponse.body)
      }
    }); 

    assert(versionUrls.length===7);
    getVersionInfos(appUrls, versionUrls,(versionsResponse)=>{

      fixVersionList(appUrls.apps, versionUrls);

      writeAllToFiles(appUrls)
      .then(() => {
        console.log("done");
      }).catch(err => {console.log(err);});
      
    });

  });
});




