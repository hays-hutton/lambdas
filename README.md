Continuously Add Sentiment Scores to Your Database Without A Server
===================================================================

Back in October at their re:Invent conference,
AWS enhanced Lambda functions with
a new Scheduled Event Source. Basically, this allowed for 
a cron style service using Lambda functions. In essence,
one can create a hosted cron service in the cloud written in 
Javascript, Python, or Java (and thereby any of the JVM languages
too including both Clojure and Scala).

Most of the AWS examples, and even the "Blueprint" in the Lambda console, 
create an instance of what they call a canary. These examples basically
do little more than check something on a repeated basis which creates
a stream of repeated responses. It's like a "poor man's" version of Pingdom.

While there is certainly utility in these canaries which can check the 
repeated status of an http call to your website, the possibilities of
putting these canaries to even more work especially in conjunction with
a hosted database as a service (DBaaS) are almost endless and maybe even
more useful than the canary idiom.

We are going to explore using these Scheduled Event Lambdas to regularly
query a database for "missing" data. To then take that data and use it to call
an Alchemy API Sentiment Scorer for gathering some enhanced information. And then to update
the database record with that enhancement. All from a zero maintenance, low cost
service in the cloud.

Setup
-----

I will use as an example a very simple MongoDB data collection. It will consist
of the text and timestamps of a bunch of tweets related to the New Year. Nothing
more than a simple sample of data from the Twitter firehose API. In reality, this
could be any text field such as a comment on a blog, the text of a help desk request, 
the body of an email, or any text field which a person created. So as you look through
this feel free to extrapolate the example to some text fields you may have in a database 
of yours.

![An Example Tweet](/img/tweet.png?raw=true "An Example Tweet")

Setting Up the Lambdas
----------------------

Lambdas are created either in a web console by pasting code into a text field or by posting
them to an AWS api. For serious work, using the aws-cli tool with some local scripts
to help manage this process is much preferred to pasting code in a web page. This way 
you can get the benefits of quickly iterating, soure control and including multiple files.
The following code snippet is an example bash script which will clean up, package, and submit
the code to AWS every time it is called:


    #! /usr/bin/env bash
    # This is the lambda bash script used to push code to AWS so you don't have to copy and paste
    # This script is customized for one particular function which is named "pull"
     
    rm pull.zip                   #cleanup previous package
    zip pull.zip index.js         #add the handler code which the Lambda service will call
    zip pull.zip package.json     #add the description of dependencies
    zip pull.zip .env             #I use this to have some environment settings in a file since lambdas don't support setting the environment
    zip pull.zip twit.pem         #The cert for calling Compose MongoDB+ with SSL
    zip -r pull.zip node_modules  #The Lambda function's dependencies
    #The next line takes the zip file and posts it to AWS Lambda. (You can use versions too but this relies on the default $Latest.)
    aws lambda update-function-code --function-name pull --zip-file fileb://./pull.zip

Configure a Lambda Function
---------------------------

Lambdas are configured by defining the function name which AWS will call in a particular
file. Thus, index.handler equals call the handler function inside of index.js. Plus they are
configured to use resources too. Our function calls don't do much processing
since they are I/O heavy, so there isn't any need to push up the resource usage. Although
you will probably need to push up the Timeout so your function won't fail as it waits for responses.

![Config](/img/Config.png?raw=true "Config Your Lambda Function")

Schedule a Lambda Function
--------------------------

The Scheduled Event Source which "kicks off" or calls the Lambda function you register
can be scheduled for any period of time from 5 minutes up.

![Scheduled](/img/AddEventSourcePull.png?raw=true "Set Schedule")

Pull the Data
-------------

The pull function was just configured to run every five minutes. It queries a MongoDB colletion
named "tweets" and pulls a limited set of documents which haven't been enhanced with new data yet.
If you look at the query, it pulls documents from the collection which don't have the
sentiment_score attribute from the Alchemy API. The set of documents is artificially limited by the query to
conserve resource consumption.

    var tweets = db.collection('tweets');
    tweets.find({sentiment_score: {$exists: false}}).
           limit(process.env.LIMIT).
           toArray(function(err, docs) {
              ...
    
When the documents come back to the function, it loops through
the docs and calls a new Lambda function named "put" with the entire tweet as the
payload. It will use the tweet text to get enhanced data and the document _id to perform
the update in MongoDB.

    _.each(docs, function(doc) {
      var params = {
        FunctionName: 'put',
        InvocationType: 'Event',
        Payload: JSON.stringify(doc)
      };
      lambda.invoke(params, function(err, res) {
        if(err) {
          console.log(err);
        } else {
          console.log(res);
        }
      });
    });

Note that for the above to work the lambda role must have permission to invoke
the "put" lambda.

The "put" Lambda Function
-------------------------

While the "pull" lambda is called by the AWS Schedule every five minutes , the "put" function
is invoked for each document returned in the sentiment_score not exists query. On each of these "put" lambda calls,  an api request is made. 
It receives the response, and then updates the MongoDB document by adding
the sentiment_score. From then on, this document won't show up in the "pull" query
any longer.

    //This is invoked by AWS in response to the "pull" function invoke call
    //The event is populated payload from the "pull" funcion
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

        ...  // Connect to MongoDB 
        
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
      });

Continuously Checking -- Working that Canary
--------------------------------------------

Once these tweet documents are updated with their sentiment scores they won't be
pulled in the query anymore. So the function will regulate itself and continuously
check over and over again if there is anything for it to do.

![An Updated Tweet](/img/UpdatedTweet.png?raw=true "An Updated Tweet")

In the end this ends up being a simple and cost effective method of enhancing or
fixing up something in any of your databases. It's still kind of like that canary
example Amazon uses but I like to think of it as putting those canaries to
work.

