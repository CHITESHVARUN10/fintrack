require('dotenv').config();
const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error("No API key found in .env");
  process.exit(1);
}
fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`)
  .then(res => res.json())
  .then(data => {
    if (data.models) {
      console.log("Available models:");
      data.models.forEach(m => console.log(m.name));
    } else {
      console.log("Response:", data);
    }
  })
  .catch(console.error);
