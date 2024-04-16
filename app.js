import express from "express";
import bodyParser from "body-parser";
import OpenAI from "openai";
import fs from "fs";
import dotenv from "dotenv";
import morgan from "morgan";
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(morgan("combined"));
app.use(express.static('static'));
const apiKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI(apiKey);
let assistant_id;
// Create an Assistant
async function createAssistant() {

  const file = await openai.files.create({ file: fs.createReadStream('uffici.pdf'), purpose: 'assistants' });
  const file1 = await openai.files.create({ file: fs.createReadStream('statuto.pdf'), purpose: 'assistants' });
  const file2 = await openai.files.create({ file: fs.createReadStream('regphd.pdf'), purpose: 'assistants' });
  console.log('Upload file for assistant: ', file.id)

  const assistantResponse = await openai.beta.assistants.create({
    name: "IMT Helper", // adjust name as per requirement
    instructions: "you are an ai assistant that answer only queries about IMT Alti Studi Lucca. Do not reply if the question is not about IMT saying you are not authorized to reply if the question is not about imt",
//    tools: [{ type: 'code_interpreter' }],
    tools: [{ type: 'retrieval' }],
    model: "gpt-4-1106-preview", 
//    model: "gpt-3.5-turbo", 
    file_ids: [file.id,file1.id,file2.id],
  });
  assistant_id = assistantResponse.id;
  console.log(`Assistant ID: ${assistant_id}`);
}

createAssistant();
app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'build', 'index.html'));
  });

// Endpoint to handle chat
app.post("/chat", async (req, res) => {
  try {
    if (!req.body.message) {
      return res.status(400).json({ error: "Message field is required" });
    }
    const userMessage = req.body.message;

    // Create a Thread
    const threadResponse = await openai.beta.threads.create();
    const threadId = threadResponse.id;

    // Add a Message to a Thread
    await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: userMessage,
    });

    // Run the Assistant
    const runResponse = await openai.beta.threads.runs.create(threadId, {
      assistant_id: assistant_id,
    });

    // Check the Run status
    let run = await openai.beta.threads.runs.retrieve(threadId, runResponse.id);
    while (run.status !== "completed") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      run = await openai.beta.threads.runs.retrieve(threadId, runResponse.id);
    }

    // Display the Assistant's Response
const messagesResponse = await openai.beta.threads.messages.list(threadId);
const assistantResponses = messagesResponse.data.filter(msg => msg.role === 'assistant');
const response = assistantResponses.map(msg => 
  msg.content
    .filter(contentItem => contentItem.type === 'text')
    .map(textContent => textContent.text.value)
    .join('\n')
).join('\n');

res.json({ response });

  } catch (error) {
    console.error("Error processing chat:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
