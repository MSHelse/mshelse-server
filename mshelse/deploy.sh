#!/bin/bash
npx expo export --platform web && echo "/* /index.html 200" > dist/_redirects && cp -r .vercel dist/ && npx vercel deploy dist --prod
