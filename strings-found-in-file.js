// This script looks for a specific string in all files in all repositories of an organization on GitHub.
// It then saves them to a file called found_in_logs.txt.

const { Octokit } = require("@octokit/rest");
const fs = require("fs");

// Configuration
const GITHUB_TOKEN = "YOUR_GITHUB_TOKEN_HERE";
const ORG_NAME = "YOUR_ORG_NAME_HERE";
const OUTPUT_FILE = "found_in_logs.txt"; // Define the file name to save "Found in" lines

// Initialize Octokit
const octokit = new Octokit({
  auth: GITHUB_TOKEN,
});

// Function to save "Found in" lines to a file
function saveFoundInLine(line) {
  fs.appendFile(OUTPUT_FILE, line + "\n", (err) => {
    if (err) {
      console.error("Error writing to file:", err);
    }
  });
}

async function searchRepos() {
  try {
    const repos = await octokit.paginate(octokit.repos.listForOrg, {
      org: ORG_NAME,
      type: "all",
      per_page: 100,
    });

    for (const repo of repos) {
      try {
        const contents = await octokit.repos.getContent({
          owner: ORG_NAME,
          repo: repo.name,
          path: "",
        });

        for (const content of contents.data) {
          if (content.type === "file") {
            try {
              const file = await octokit.repos.getContent({
                owner: ORG_NAME,
                repo: repo.name,
                path: content.path,
              });

              const fileContent = Buffer.from(file.data.content, "base64").toString();
              if (fileContent.includes("gcr.io/mfp-infra")) {
                console.log(fileContent);
                const foundInLine = `Found in ${repo.name}: ${content.path}`;
                console.log(foundInLine);
                saveFoundInLine(foundInLine); // Save to file
              }
            } catch (fileError) {
              console.error(`Error fetching file ${content.path} in ${repo.name}:`, fileError);
            }
          }
        }
      } catch (contentError) {
        console.error(`Error fetching contents of ${repo.name}:`, contentError);
      }
    }
  } catch (reposError) {
    console.error("Error fetching repositories:", reposError);
  }
}

searchRepos();
