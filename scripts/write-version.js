const { execFileSync } = require("child_process")
const fs = require("fs")
const path = require("path")
const { buildRevision } = require("./build-revision")

const root = path.resolve(__dirname, "..")
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))

let commit = "unknown"
try {
  commit = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim()
} catch (error) {
  // Source archives do not always contain Git metadata.
}

const manifest = {
  version: pkg.version,
  commit,
  revision: buildRevision(pkg.version, commit),
  built_at: new Date().toISOString(),
  api_version: 1,
  source: "official-dist",
}

const dist = process.env.WEBUI_BUILD_OUTPUT
  ? path.resolve(process.env.WEBUI_BUILD_OUTPUT)
  : path.join(root, "dist")
fs.mkdirSync(dist, { recursive: true })
fs.writeFileSync(
  path.join(dist, "version.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8"
)
