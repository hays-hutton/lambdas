require('dotenv').load();

var fs = require('fs');
var ca = [fs.readFileSync(__dirname + "/twit.pem")];

var MongoClient = require('mongodb').MongoClient;
var ObjectID = require('mongodb').ObjectID;
var mongo_url = process.env.MONGO_URL;

var request = require('request');
var _ = require('lodash');

exports.handler = function(event, context) {
  //See the event in CloudWatch
  console.log(event);

  var alchemyURL = 'https://gateway-a.watsonplatform.net/calls/text/TextGetTextSentiment'; 

  var postData = {
    //Set your ALCHEMY_KEYs in your .env file and include it in your zip package
    apikey: process.env.ALCHEMY_KEY,
    text: event.tweet,
    outputMode: 'json'
  };

  request.post({url: alchemyURL, form: postData}, function(err, res, body) {
    if(err) {
      console.log(err);
    };
    //See the alchemy response in CloudWatch
    console.log(body);
    MongoClient.connect(mongo_url,{
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

        var tweets = db.collection('tweets');
        var alchemy_data = JSON.parse(body);
        var oid = new ObjectID(event._id);
        if(alchemy_data.status === "ERROR") {
          tweets.update({_id: oid},
                        {$set: { sentiment_score: 0,
                                 sentiment_status: "ERROR",
                                 sentiment_status_info: alchemy_data.statusInfo}});
        } else if(alchemy_data.docSentiment.type === "neutral") {
          tweets.update({_id: oid},
                        {$set: { sentiment_score: 0,
                                 sentiment_status: "NEUTRAL",
                                 sentiment_status_info: "NEUTRAL"}});
        } else {
          var score = alchemy_data.docSentiment.score;
          tweets.update({_id: oid},
                        {$set: { sentiment_score: score,
                                 sentiment_status: alchemy_data.docSentiment.type,
                                 sentiment_status_info: "OK"}});
        }
        //Call this to end your function otherwise it will wait until timeout
        context.succeed();
      }
    );
  });
};
