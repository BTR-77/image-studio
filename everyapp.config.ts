import { defineEveryApp } from "@every-app/sdk";

// defineEveryApp types the manifest. The Gateway keeps it; the Worker gets
// the bindings it lists (env.DB, env.images, env.AI), never the file.
export default defineEveryApp({
  id: "image-studio",
  name: "Image Studio",
  description:
    "Make pictures from a written description and change existing ones by saying what to change.",
  icon: "/icon.svg",
  access: "everyone",
  resources: {
    d1: ["DB"],
    // The pictures people make and the images they upload.
    r2: ["images"],
    // Workers AI on the account the app is deployed to.
    ai: ["AI"],
  },
});
