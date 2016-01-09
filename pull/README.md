Steps to use this AWS function
==============================

1. Run "npm install" in this directory
2. Create a .env file which has the MONGO_URL 
3. Add the certificate file to connect to Compose MongoDB+. 
4. Create the pull function in the AWS lambda console at least once. Then the "lambda" script should work. 
5. Configure the AWS command line (see http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-getting-started.html) 
6. Run ./lambda
7. In the AWS Lambda console, hit test to see if it works
8. Adjust pull code to point to your text field in your MongoDB collection
