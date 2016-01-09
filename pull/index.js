
//this loads environment variables from a .env file into process.env since you
//can't set environment variables in a lammbda function
require('dotenv').load();

var _ = require('lodash');
var aws = require('aws-sdk');

//it's a best practice to specify the version since it can change on you
var lambda = new aws.Lambda({apiVersion: '2015-03-31'});

//This is the certificate file for MongoDB+
//It isn't included in the repo for a good reason ;)
//  see this for details
//  https://www.compose.io/articles/one-missing-key-and-how-it-broke-node-js-and-mongodb/
var fs = require('fs');
var ca = [fs.readFileSync(__dirname + "/twit.pem")];

//The repo doesn't contain the .env file which has the url
var MongoClient = require('mongodb').MongoClient;
var mongo_url = process.env.MONGO_URL;

//This is what AWS will call: index.handler. The event parameter
//is whatever is put in the payload of the invoke call (see the put/index.js for an example).
//For this function, the payload doesn't matter whereas in the "put" function it does.
//The context param is the AWS context of the call. It has things like time left etc...
//
exports.handler = function(event, context) {
  MongoClient.connect(mongo_url, {
    // see this: https://www.compose.io/articles/one-missing-key-and-how-it-broke-node-js-and-mongodb/
    mongos: {
          ssl: true,
          sslValidate: true,
          sslCA: ca,
          ca: ca,
          poolSize: 1,
          reconnectTries: 1
        }
    }, function(err, db) {
      if(err) {
        console.log(err);
      };

      //Get the tweets collection which is populated already
      var tweets = db.collection('tweets');
      //Query for documents which don't have a sentiment_score yet
      tweets.find({sentiment_score: {$exists: false}}).limit(1).toArray(function(err, docs) { 
        if(err) {
          console.log(err);
        };
        // track how many so we can call context.succeed() when we are done.
        // Otherwise we will wait to timeout
        var counter = docs.length - 1;
        //For each of the docs, invoke the 'put' function and pass the doc as a parameter.
        //  (It will be the event parameter in the 'pull' function call)
        _.each(docs, function(doc, idx) {
          console.log(doc);
          var params = {
            FunctionName: 'put',
            InvocationType: 'Event',
            Payload: JSON.stringify(doc)
          };
          lambda.invoke(params, function(err, res) {
            //While it isn't necessary to log these,
            //it is nice to see them while debugging at least.
            //Every console.log shows up in CloudWatch
            if(err) {
              console.log(err);
            } else {
              console.log(res);
              if(counter == idx) {
                context.succeed(idx);
              };
            }
          });
        });
        console.log("pull done with count of ", docs.length);
      });
    });
};
