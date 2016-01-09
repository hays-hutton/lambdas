Steps to use this AWS function
==============================

1. Run "npm install" in this directory
2. Create a .env file which has the MONGO_URL and ALCHEMY_KEY 
3. Add the certificate file to connect to Compose MongoDB+ (i called mine twit.pem and included it in the package via the lambda script) 
4. Create the put function in the AWS lambda console at least once. Then the "lambda" script should work. 
5. Configure the AWS command line (see http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html) 
6. Run ./lambda
8. Adjust put code to point to your document in your MongoDB collection
