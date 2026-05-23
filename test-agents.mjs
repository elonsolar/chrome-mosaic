import { ConfigAgent } from "./packages/opencode/src/config/agent"

const agents = await ConfigAgent.load("C:\\Users\\64162\\source\\ai\\free-ai-refactor")
console.log("Loaded agents:", Object.keys(agents))
console.log("\nReview agent:", JSON.stringify(agents.review, null, 2))
console.log("\nTest agent:", JSON.stringify(agents.test, null, 2))
