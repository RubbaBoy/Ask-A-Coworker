import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const MANIFEST_TEMPLATE_PATH = path.join(ROOT_DIR, 'manifests', 'teams-app', 'manifest.json');
const COLOR_ICON_PATH = path.join(ROOT_DIR, 'manifests', 'teams-app', 'color.png');
const OUTLINE_ICON_PATH = path.join(ROOT_DIR, 'manifests', 'teams-app', 'outline.png');

// Load environment variables
dotenv.config({ path: path.join(ROOT_DIR, '.env') });

async function main() {
  console.log('Teams App Packaging Script');
  console.log('=============================');
  console.log('This script will create a manifest.json and zip it for Microsoft Teams based on your .env variables.');

  // Ensure dist directory exists
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  // 1. Gather Information & Read Manifest
  console.log('\nStep 1: Configuration & Reading Manifest');
  
  const appId = process.env.MICROSOFT_APP_ID;
  if (!appId) {
    throw new Error('MICROSOFT_APP_ID is not set in .env');
  }

  let manifestContent: string;
  let manifest: any;
  try {
    manifestContent = fs.readFileSync(MANIFEST_TEMPLATE_PATH, 'utf-8');
    manifest = JSON.parse(manifestContent);
  } catch (error: any) {
    console.error('Error reading manifest template:', error.message);
    process.exit(1);
  }

  const version = process.env.TEAMS_APP_VERSION || manifest.version;
  
  const defaultDomain = process.env.APP_WEBSITE_URL ? `https://${process.env.APP_WEBSITE_URL}` : manifest.developer.websiteUrl;
  const websiteUrl = process.env.TEAMS_APP_WEBSITE_URL || defaultDomain;
  const privacyUrl = process.env.TEAMS_APP_PRIVACY_URL || (process.env.APP_WEBSITE_URL ? `${websiteUrl}/privacy` : manifest.developer.privacyUrl);
  const termsUrl = process.env.TEAMS_APP_TERMS_URL || (process.env.APP_WEBSITE_URL ? `${websiteUrl}/terms` : manifest.developer.termsOfUseUrl);
  
  const appName = process.env.TEAMS_APP_NAME || manifest.name.short;
  const appDescShort = process.env.TEAMS_APP_DESC_SHORT || manifest.description.short;
  const appDescFull = process.env.TEAMS_APP_DESC_FULL || manifest.description.full;

  // 2. Template Manifest
  console.log('\nStep 2: Generating manifest.json...');
  
  try {

    // Replace placeholders and update values
    manifest.id = appId;
    manifest.version = version;
    
    // Handle string replacement for ID which appears multiple times in the template
    const manifestStr = JSON.stringify(manifest, null, 2).replace(/\$\{MICROSOFT_APP_ID\}/g, appId);
    manifest = JSON.parse(manifestStr);

    // Update other fields
    manifest.name.short = appName;
    manifest.name.full = appName.length > 20 ? appName : `${appName} MCP`;

    manifest.description.short = appDescShort;
    manifest.description.full = appDescFull;

    manifest.developer.websiteUrl = websiteUrl;
    manifest.developer.privacyUrl = privacyUrl;
    manifest.developer.termsOfUseUrl = termsUrl;

    // Validate validDomains
    try {
        const url = new URL(websiteUrl);
        if (url.hostname !== 'example.com') {
             manifest.validDomains = [url.hostname];
        }
    } catch (e) {
        // ignore
    }

    // Write manifest to dist
    const distManifestPath = path.join(DIST_DIR, 'manifest.json');
    fs.writeFileSync(distManifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Created ${distManifestPath}`);

    // 3. Copy Icons
    console.log('\nStep 3: Copying icons...');
    const distColorPath = path.join(DIST_DIR, 'color.png');
    const distOutlinePath = path.join(DIST_DIR, 'outline.png');
    
    fs.copyFileSync(COLOR_ICON_PATH, distColorPath);
    fs.copyFileSync(OUTLINE_ICON_PATH, distOutlinePath);
    console.log('Icons copied to dist/');

    // 4. Zip Package
    console.log('\nStep 4: Creating ZIP package...');
    const zipPath = path.join(DIST_DIR, 'teams-app.zip');
    
    try {
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }

      const cmd = `zip -j -q "${zipPath}" "${distManifestPath}" "${distColorPath}" "${distOutlinePath}"`;
      execSync(cmd);
      console.log(`Successfully created: ${zipPath}`);
      console.log('\nPackage ready for upload to Teams Admin Center!');
    } catch (error: any) {
      console.error('Failed to zip files. Ensure "zip" is installed on your system.');
      console.error('Error details:', error.message);
      process.exit(1);
    }

  } catch (error: any) {
    console.error('Error processing manifest:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
