# Login and save cookie
curl -s -c cookie.txt -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"rohan@test.com","password":"Test@1234"}' > /dev/null
echo "Logged in"

# Upload PDF using cookie
FORM_RES=$(curl -s -b cookie.txt -X POST http://localhost:3000/api/form16/upload -F "pdf=@/Users/chiteshvarun/D-drive/fintrack/pdfs/Sample_Form16_30L_FY2025_26.pdf")
FORM_ID=$(echo $FORM_RES | grep -o '"_id":"[^"]*' | cut -d'"' -f4)
echo "Uploaded, ID: $FORM_ID"

# Get Recommendation
curl -s -b cookie.txt -X GET http://localhost:3000/api/form16/$FORM_ID/recommendation > /dev/null
echo "Recommendation requested"
