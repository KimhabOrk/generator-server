'use stric';
const express = require('express');
const app = express();
const { Web3 } = require('web3');
const fs = require('fs');
var favicon = require('serve-favicon')
// const puppeteer = require('puppeteer');
const cors = require('cors');
const path = require('path');
var beautify = require('js-beautify').js;
const Server = require('http').Server;
const server = new Server(app);
require('./polyfill.js');

var web3 = new Web3(`https://eth-sepolia.g.alchemy.com/v2/qKOejal-tbfyH6_jIHxCGwExilHgqmbF`);
const contractABI = require('./artifacts/DiGiGenArt721CoreV3.json');
const contractAddress = "0x151B912f2c7c1CB9CEc9d4e86cd1c2F7f2ECF77b";
const contract = new web3.eth.Contract(contractABI, contractAddress);
console.log(contractAddress);

app.set('views', './views');
app.set('view engine', 'pug');
app.use(express.static(__dirname + './'));
app.use(express.static('views'));
app.use(cors());

app.use((request, response, next) => {
	request.header("Content-Type", "application/json")
	response.setHeader('Access-Control-Allow-Origin', '*');
	response.setHeader("Content-Type", "application/json");
	response.setHeader("Content-Type", "text/html");
	next()
});
app.use(favicon(__dirname + '/favicon.png'));
let pathToHtml = path.join(__dirname, 'index.html');

app.get("/project/:projectId", async (request, response) => {
	if (!Number.isInteger(Number(request.params.projectId))) {
		console.log("not integer");
		response.send('invalid request');
	} else {
		const nextProjectId = await contract.methods.nextProjectId().call();
		const exists = request.params.projectId < nextProjectId;
		if (exists) {
			const projectDetails = await getDetails(request.params.projectId);
			const projectState = await contract.methods.projectStateData(request.params.projectId).call();
			let script = await getScript(request.params.projectId, projectDetails.projectScriptInfo.scriptCount);
			let beautifulScript = beautify(script, { indent_size: 5, space_in_empty_paren: true });
			response.setHeader("Content-Type", "text/html");
			response.render('projectDetails', {
				name: projectDetails.projectDescription.projectName,
				artist: projectDetails.projectDescription.artistName,
				description: projectDetails.projectDescription.description,
				website: projectDetails.projectDescription.artistWebsite,
				license: projectDetails.projectDescription.license,
				scriptTypeAndVersion: projectDetails.projectScriptInfo.scriptTypeAndVersion,
				scriptRatio: projectDetails.projectScriptInfo.aspectRatio,
				script: beautifulScript,
				artistAddress: projectDetails.projectTokenInfo.artistAddress,
				additionalPayee: projectDetails.projectTokenInfo.additionalPayee,
				additionalPayeePercentage: projectDetails.projectTokenInfo.additionalPayeePercentage,
				invocations: projectState.invocations,
				maxInvocations: projectState.maxInvocations,
				active: projectState.active,
				paused: projectState.paused,
				locked: projectState.locked
			})
		} else {
			response.send('project does not exist');
		}
	}
});

app.get("/", async (request, response) => {
	response.setHeader("Content-Type", "text/html")
	response.render('home');
})

app.get("/platform", async (request, response) => {
	const platformInfo = await getPlatformInfo();
	let projects = [];
	for (let i = 0; i < platformInfo.nextProjectId; i++) {
		projects.push(i);
	}
	response.render('platformInfo', {
		name: platformInfo.name,
		symbol: platformInfo.symbol,
		address: platformInfo.address,
		nextProjectId: platformInfo.nextProjectId
	})
})

app.get('/:tokenId', async (request, response) => {
  const projectId = await contract.methods.tokenIdToProjectId(request.params.tokenId).call();
  const projectDetails = await getDetails(projectId);
  const tokenHashes = await getTokenHashes(request.params.tokenId);
  const royalties = await getTokenRoyaltyInfo(request.params.tokenId);
  response.setHeader('Content-Type', 'application/json');
  response.send(
  {
    "platform": "DiGi Gallery",
    "name": projectDetails.projectDescription.projectName + " #" + (request.params.tokenId),
    "description": projectDetails.projectDescription.description,
    "external_url": projectDetails.projectURIInfo.projectBaseURI.slice(0, -6) + "generator/" + request.params.tokenId,
    "artist": projectDetails.projectDescription.artistName,
    "royaltyInfo": {
      "artistAddress": royalties.artistAddress,
      "additionalPayee": royalties.additionalPayee,
      "additionalPayeePercentage": royalties.additionalPayeePercentage,
      "royaltyFeeByID": royalties.royaltyFeeByID
    },
    "traits": [
      {
        "trait_type": "Project",
        "value": projectDetails.projectDescription.projectName + " by " + projectDetails.projectDescription.artistName
				}
			],

    "website": projectDetails.projectDescription.artistWebsite,
    "script type": projectDetails.projectScriptInfo.scriptTypeAndVersion,
    "aspect ratio (w/h)": projectDetails.projectScriptInfo.aspectRatio,
    "tokenID": request.params.tokenId,
    "tokenHash": tokenHashes,
    "license": projectDetails.projectDescription.license,
    "image": projectDetails.projectURIInfo.projectBaseURI.slice(0, -6) + "image/" + request.params.tokenId
  });
});

app.get('/generator/:tokenId', async (request, response) => {
  const projectId = await contract.methods.tokenIdToProjectId(request.params.tokenId).call();
  const projectDetails = await getDetails(projectId);
  const script = await getScript(projectId, projectDetails.projectScriptInfo.scriptCount);
  const tokenData = await getToken(request.params.tokenId);
  const data = buildData(tokenData.hashes, request.params.tokenId);
  response.set('Content-Type', 'text/html');
  if (projectDetails.projectScriptInfo.scriptTypeAndVersion === 'p5@1.0.0') {
    response.render('generator_p5js', { script: script, data: data })
  } else if (projectDetails.projectScriptInfo.scriptTypeAndVersion === 'aframe@1.0.0') {
    response.render('generator_aframe', { script: script, data: data })
  } else if (projectDetails.projectScriptInfo.scriptTypeAndVersion === 'tone@1.0.0') {
    response.render('generator_tonejs', { script: script, data: data })
  } else if (projectDetails.projectScriptInfo.scriptTypeAndVersion === 'paper@1.0.0') {
    response.render('generator_paperjs', { script: script, data: data })
  } else if (projectDetails.projectScriptInfo.scriptTypeAndVersion === 'babylon@1.0.0') {
    response.render('generator_babylon', { script: script, data: data })
  } else if (projectDetails.projectScriptInfo.scriptTypeAndVersion === 'svg@1.0.0') {
    response.render('generator_svg', { script: script, data: data })
  } else if (projectDetails.projectScriptInfo.scriptTypeAndVersion === 'regl@1.0.0') {
    response.render('generator_regl', { script: script, data: data })
  } else if (projectDetails.projectScriptInfo.scriptTypeAndVersion === 'zdog@1.0.0') {
    response.render('generator_zdog', { script: script, data: data })
  } else if (projectDetails.projectScriptInfo.scriptTypeAndVersion === 'threejs@1.0.0') {
    response.render('generator_threejs', { script: script, data: data })
  } else if (projectDetails.projectScriptInfo.scriptTypeAndVersion === 'js') {
    response.render('generator_js', { script: script, data: data })
  } else {
    response.send('token does not exist');
  }

});
/*
app.get("/image/:tokenId/:refresh?", async (request, response) => {
	//check if token exists
	if (!Number.isInteger(Number(request.params.tokenId))) {
		console.log("not integer");
		response.send('invalid request');
	} else {
		const file = path.resolve(__dirname, "./images/" + request.params.tokenId + ".png");
		if (fs.existsSync(file) && !request.params.refresh) {
			console.log('serving local');
			response.sendFile(file);
		} else {
			const projectId = await getProjectId(request.params.tokenId);
			const tokensOfProject = await contract.methods.projectStateData(projectId).call();
			const exists = tokensOfProject(tokenId);
			const scriptInfo = await contract.methods.projectScriptInfo(projectId).call();
			const scriptJSON = scriptInfo[0] && JSON.parse(scriptInfo[0]);
			const ratio = eval(scriptJSON.aspectRatio ? scriptJSON.aspectRatio : 1);
			console.log("exists? " + exists);
			console.log('image request ' + request.params.tokenId);


			if (exists) {
				serveScriptResult(request.params.tokenId, ratio).then(result => {
					console.log("Running Puppeteer");
					response.set('Content-Type', 'image/png');
					response.send(result);
				});
			} else {
				response.send('token does not exist');
			}
		}
	}
});

async function serveScriptResult(tokenId, ratio) {
	const result = await contract.methods.projectScriptDetails(projectId).call();
	const width = Math.floor(result.ratio <= 1 ? 1200 * ratio : 1200);
	const height = Math.floor(result.ratio <= 1 ? 1200 : 1200 / ratio);
	const path = './images/' + tokenId + '.png';
	try {

		const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
		const page = await browser.newPage();
		await page.setViewport({
			width: width,
			height: height,
			deviceScaleFactor: 2,
		});
		//await page.goto('http://localhost:8080/generator/'+tokenId);
		await page.goto('https://api.digigallery.xyz/generator/' + tokenId);
		await timeout(500);
		const image = await page.screenshot();
		await browser.close();
		fs.writeFile("./images/" + tokenId + ".png", image, function (err) {

		});
		return image;
	} catch (error) {
		console.log(tokenId + '| this is the error: ' + error);

	}
}
*/

function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
};

async function getToken(tokenId) {
  const projectId = await getProjectId(tokenId);
  const hashes = await getTokenHashes(tokenId);
  return { tokenId, projectId, hashes };
}

async function getDetails(projectId) {
  const projectDescription = await getProjectDescription(projectId);
  const projectScriptInfo = await getScriptInfo(projectId);
  const projectTokenInfo = await getTokenDetails(projectId);
  const projectURIInfo = await getURIInfo(projectId);
  return { projectDescription, projectScriptInfo, projectTokenInfo, projectURIInfo };
}

async function getScript(projectId, scriptCount) {
  let scripts = [];
  for (let i = 0; i < scriptCount; i++) {
    let newScript = await contract.methods.projectScriptByIndex(projectId, i).call();
    scripts.push(newScript);
  }
  return scripts.join(' ');
}

async function getScriptInfo(projectId) {
  const result = await contract.methods.projectScriptDetails(projectId).call();
  return { scriptTypeAndVersion: result[0], scriptCount: result[1], aspectRatio: result[2] };
}

async function getProjectDescription(projectId) {
  const result = await contract.methods.projectDetails(projectId).call();
  return { projectName: result[0], artistName: result[1], description: result[2], artistWebsite: result[3], license: result[4] };
}

async function getURIInfo(projectId) {
  const result = await contract.methods.projectURIInfo(projectId).call();
  return { projectBaseURI: result[0], projectBaseIpfsURI: result[1], useIpfs: result[2] };
}

async function getTokenDetails(projectId) {
  const tokens = await contract.methods.projectStateData(projectId).call();
  const result = await contract.methods.projectArtistPaymentInfo(projectId).call();
  return { artistAddress: result[0], invocations: result[1], maxInvocations: result[2], active: result[3], locked: result[4], additionalPayeePrimarySales: result[5], additionalPayeePrimarySalesPercentage: result[6], tokens: tokens };
}

async function getTokenRoyaltyInfo(tokenId) {
  const result = await contract.methods.getRoyaltyData(tokenId).call();
  return { artistAddress: result[0], additionalPayee: result[1], additionalPayeePercentage: result[2], royaltyFeeByID: result[3] };
}

async function getTokenHashes(tokenId) {
  const result = await contract.methods.tokenIdToHash(tokenId).call();
  return result;
}

async function getPlatformInfo() {
  //	const totalSupply = await contract.methods.totalSupply().call();
  //const projectIds = await contract.methods.showAllProjectIds().call(); //cap S
  const nextProjectId = await contract.methods.nextProjectId().call(); //change platofrm_
  const name = await contract.methods.name().call();
  const symbol = await contract.methods.symbol().call();
  const address = '0x151B912f2c7c1CB9CEc9d4e86cd1c2F7f2ECF77b';
  return { nextProjectId, name, symbol, address };
}

async function getProjectId(tokenId) {
  const result = await contract.methods.tokenIdToProjectId(tokenId).call();
  return result;
}

function buildData(hashes, tokenId) {
  //to expose token hashes use let hashes = tokenData.hashes[0] (example if only one hash is minted)
  let data = {};
  data.hashes = hashes;
  data.tokenId = tokenId;
  return `let tokenData = ${JSON.stringify(data)}`;
}

function toBuffer(ab) {
  var buf = Buffer.alloc(ab.byteLength);
  var view = new Uint8Array(ab);
  for (var i = 0; i < buf.length; ++i) {
    buf[i] = view[i];
  }
  return buf;
}


server.listen(8000, () => console.log(`DiGi Art listening at http://localhost:8000`))