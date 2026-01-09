FROM oven/bun:1
WORKDIR /app 
COPY package.json ./
RUN bun install
COPY index.ts ./
CMD ["bun", "index.ts"]
