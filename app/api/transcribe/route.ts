// import { NextResponse } from "next/server";
// import axios from "axios";
// import FormData from "form-data";

// export async function POST(req: Request) {
//   const body = await req.json();
//   const { audioFile } = body; // base64 string from frontend
//   const apiKey = process.env.GROQ_API_KEY;

//   try {
//     const formData = new FormData();
//     // Convert base64 back to binary buffer
//     const base64Data = audioFile.split(",")[1]; // remove "data:audio/webm;base64,"
//     const buffer = Buffer.from(base64Data, "base64");

//     formData.append("file", buffer, { filename: "audio.webm" });
//     formData.append("model", "whisper-large-v3");

//     const response = await axios.post(
//       "https://api.groq.com/openai/v1/audio/transcriptions",
//       formData,
//       {
//         headers: {
//           Authorization: `Bearer ${apiKey}`,
//           ...formData.getHeaders(),
//         },
//       }
//     );

//     return NextResponse.json(response.data);
//   } catch (error: any) {
//     console.error(error.response?.data || error.message);
//     return NextResponse.json({ error: "Failed to transcribe audio" }, { status: 500 });
//   }
// }


import { NextResponse } from "next/server";
import axios from "axios";
import FormData from "form-data";

export async function POST(req: Request) {
  const body = await req.json();
  const { audioFile, groqKey } = body;

  if (!groqKey || !groqKey.trim()) {
    return NextResponse.json({ error: "Groq API key is missing." }, { status: 401 });
  }

  try {
    const base64Data = audioFile.split(",")[1];
    const buffer = Buffer.from(base64Data, "base64");

    // Skip if audio chunk is too small (less than 1KB = silence/empty)
    if (buffer.length < 1000) {
      return NextResponse.json({ text: "" });
    }

    const formData = new FormData();
    formData.append("file", buffer, { filename: "audio.webm", contentType: "audio/webm" });
    formData.append("model", "whisper-large-v3");
    formData.append("language", "en");

    const response = await axios.post(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      formData,
      {
        headers: {
          Authorization: `Bearer ${groqKey.trim()}`,
          ...formData.getHeaders(),
        },
      }
    );
    return NextResponse.json(response.data);
  } catch (error: any) {
    const status = error.response?.status;
    const message = error.response?.data?.error?.message || error.message;
    if (status === 401) {
      return NextResponse.json({ error: "Invalid Groq API key. Please check and try again." }, { status: 401 });
    }
    // Don't alert user for chunk errors, just log and skip
    console.error("Transcribe error:", message);
    return NextResponse.json({ text: "" }); // return empty silently so recording continues
  }
}