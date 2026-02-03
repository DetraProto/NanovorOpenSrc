/**
 * Service Request Broker (SRB) XML-RPC parsing and response building.
 */

function extractParamsFromRequest(input) {
    const params = {};

    const paramsSection = input.match(/<params>([\s\S]*)<\/params>/);
    if (paramsSection) {
        const paramsContent = paramsSection[1];

        const playernameMatch = paramsContent.match(/<member><name>playername<\/name><value><string>(.*?)<\/string><\/value><\/member>/);
        if (playernameMatch) params.playername = playernameMatch[1];

        const playerpasswordMatch = paramsContent.match(/<member><name>playerpassword<\/name><value><string>(.*?)<\/string><\/value><\/member>/);
        if (playerpasswordMatch) params.playerpassword = playerpasswordMatch[1];

        const majorversionMatch = paramsContent.match(/<member><name>majorversion<\/name><value><string>(.*?)<\/string><\/value><\/member>/);
        if (majorversionMatch) params.majorversion = majorversionMatch[1];

        const minorversionMatch = paramsContent.match(/<member><name>minorversion<\/name><value><string>(.*?)<\/string><\/value><\/member>/);
        if (minorversionMatch) params.minorversion = minorversionMatch[1];

        const buildversionMatch = paramsContent.match(/<member><name>buildversion<\/name><value><string>(.*?)<\/string><\/value><\/member>/);
        if (buildversionMatch) params.buildversion = buildversionMatch[1];

        const protocolversionMatch = paramsContent.match(/<member><name>protocolversion<\/name><value><string>(.*?)<\/string><\/value><\/member>/);
        if (protocolversionMatch) params.protocolversion = protocolversionMatch[1];

        const appkeyMatch = paramsContent.match(/<member><name>appkey<\/name><value><string>(.*?)<\/string><\/value><\/member>/);
        if (appkeyMatch) params.appkey = appkeyMatch[1];

        const sequencenumberMatch = paramsContent.match(/<member><name>sequencenumber<\/name><value><string>(.*?)<\/string><\/value><\/member>/);
        if (sequencenumberMatch) params.sequencenumber = sequencenumberMatch[1];

        const osnameMatch = paramsContent.match(/<member><name>osname<\/name><value><string>(.*?)<\/string><\/value><\/member>/);
        if (osnameMatch) params.osname = osnameMatch[1];

        const osversionMatch = paramsContent.match(/<member><name>osversion<\/name><value><string>(.*?)<\/string><\/value><\/member>/);
        if (osversionMatch) params.osversion = osversionMatch[1];

        const ostypeMatch = paramsContent.match(/<member><name>ostype<\/name><value><string>(.*?)<\/string><\/value><\/member>/);
        if (ostypeMatch) params.ostype = ostypeMatch[1];

        const serviceMatch = paramsContent.match(/<member><name>service<\/name><value><string>(.*?)<\/string><\/value><\/member>/);
        if (serviceMatch) params.service = serviceMatch[1];

        const localeMatch = paramsContent.match(/<member><name>locale<\/name><value><string>(.*?)<\/string><\/value><\/member>/);
        if (localeMatch) params.locale = localeMatch[1];
    } else {
        const allStringValues = input.match(/<param>\s*<value>\s*<string>(.*?)<\/string>\s*<\/value>\s*<\/param>/g);
        if (allStringValues && allStringValues.length >= 12) {
            const usernameMatch = allStringValues[9]?.match(/<param>\s*<value>\s*<string>(.*?)<\/string>\s*<\/value>\s*<\/param>/);
            const passwordMatch = allStringValues[10]?.match(/<param>\s*<value>\s*<string>(.*?)<\/string>\s*<\/value>\s*<\/param>/);

            if (usernameMatch) params.playername = usernameMatch[1];
            if (passwordMatch) params.playerpassword = passwordMatch[1];
        } else {
            const allStrings = input.match(/<string>(.*?)<\/string>/g);
            if (allStrings && allStrings.length >= 12) {
                const usernameContent = allStrings[9]?.match(/<string>(.*?)<\/string>/);
                const passwordContent = allStrings[10]?.match(/<string>(.*?)<\/string>/);

                if (usernameContent) params.playername = usernameContent[1];
                if (passwordContent) params.playerpassword = passwordContent[1];
            } else {
                console.log(`[${new Date().toISOString()}] Attempting to extract positional parameters from input`);
                const allStringMatches = input.match(/<string>(.*?)<\/string>/g);
                console.log(`[${new Date().toISOString()}] Found ${allStringMatches ? allStringMatches.length : 0} string matches`);

                if (allStringMatches && allStringMatches.length >= 10) {
                    const extractedStrings = allStringMatches.map(match => {
                        const contentMatch = match.match(/<string>(.*?)<\/string>/);
                        return contentMatch ? contentMatch[1] : null;
                    }).filter(content => content !== null);

                    console.log(`[${new Date().toISOString()}] Extracted ${extractedStrings.length} string values:`, extractedStrings);

                    if (extractedStrings.length >= 10) {
                        params.playername = extractedStrings[9];
                        params.playerpassword = extractedStrings[10] || '';
                        console.log(`[${new Date().toISOString()}] Extracted playername: '${params.playername}', playerpassword: '${params.playerpassword}'`);
                    }
                } else {
                    console.log('No params section found, trying alternative extraction');

                    const connectMatch = input.match(/<connect\s+([^>]+)>/);
                    if (connectMatch) {
                        const attrs = connectMatch[1];

                        const playernameMatch = attrs.match(/playername="([^"]*)"/);
                        if (playernameMatch) params.playername = playernameMatch[1];

                        const playerpasswordMatch = attrs.match(/playerpassword="([^"]*)"/);
                        if (playerpasswordMatch) params.playerpassword = playerpasswordMatch[1];

                        const majorversionMatch = attrs.match(/majorversion="([^"]*)"/);
                        if (majorversionMatch) params.majorversion = majorversionMatch[1];

                        const minorversionMatch = attrs.match(/minorversion="([^"]*)"/);
                        if (minorversionMatch) params.minorversion = minorversionMatch[1];

                        const buildversionMatch = attrs.match(/buildversion="([^"]*)"/);
                        if (buildversionMatch) params.buildversion = buildversionMatch[1];

                        const protocolversionMatch = attrs.match(/protocolversion="([^"]*)"/);
                        if (protocolversionMatch) params.protocolversion = protocolversionMatch[1];

                        const appkeyMatch = attrs.match(/appkey="([^"]*)"/);
                        if (appkeyMatch) params.appkey = appkeyMatch[1];

                        const sequencenumberMatch = attrs.match(/sequencenumber="([^"]*)"/);
                        if (sequencenumberMatch) params.sequencenumber = sequencenumberMatch[1];

                        const osnameMatch = attrs.match(/osname="([^"]*)"/);
                        if (osnameMatch) params.osname = osnameMatch[1];

                        const osversionMatch = attrs.match(/osversion="([^"]*)"/);
                        if (osversionMatch) params.osversion = osversionMatch[1];

                        const ostypeMatch = attrs.match(/ostype="([^"]*)"/);
                        if (ostypeMatch) params.ostype = ostypeMatch[1];

                        const serviceMatch = attrs.match(/service="([^"]*)"/);
                        if (serviceMatch) params.service = serviceMatch[1];

                        const localeMatch = attrs.match(/locale="([^"]*)"/);
                        if (localeMatch) params.locale = localeMatch[1];
                    }
                }
            }
        }
    }

    return params;
}

function extractParamsFromXmlRpc(xml) {
    const params = {};

    const playernameMatch = xml.match(/<member><name>playername<\/name><value><string>(.*?)<\/string><\/value><\/member>/);
    if (playernameMatch) params.playername = playernameMatch[1];

    const playerpasswordMatch = xml.match(/<member><name>playerpassword<\/name><value><string>(.*?)<\/string><\/value><\/member>/);
    if (playerpasswordMatch) params.playerpassword = playerpasswordMatch[1];

    const majorversionMatch = xml.match(/<member><name>majorversion<\/name><value><string>(.*?)<\/string><\/value><\/member>/);
    if (majorversionMatch) params.majorversion = majorversionMatch[1];

    const minorversionMatch = xml.match(/<member><name>minorversion<\/name><value><string>(.*?)<\/string><\/value><\/member>/);
    if (minorversionMatch) params.minorversion = minorversionMatch[1];

    const buildversionMatch = xml.match(/<member><name>buildversion<\/name><value><string>(.*?)<\/string><\/value><\/member>/);
    if (buildversionMatch) params.buildversion = buildversionMatch[1];

    const revisionversionMatch = xml.match(/<member><name>revisionversion<\/name><value><string>(.*?)<\/string><\/value><\/member>/);
    if (revisionversionMatch) params.revisioinversion = revisionversionMatch[1];

    return params;
}

function createSrbResponse(accountId, loginToken) {
    const response = `<?xml version="1.0"?>
<methodResponse>
  <params>
    <param>
      <value>
        <array>
          <data>
            <value>Action: CONNECT</value>
            <value>Game Service IP: 127.0.0.1: 9339</value>
            <value>Login Token: ${loginToken}</value>
            <value>AccountId: ${accountId}</value>
            <value>Web service bankfe: 127.0.0.1:8443</value>
            <value>Web service bankfe read: 127.0.0.1:8443</value>
            <value>Static File Service IP: 127.0.0.1: 9339</value>
            <value>Download Service IP: 127.0.0.1</value>
            <value>Download Service URL: 127.0.0.1:8443</value>
            <value>Web service cpnfe: 127.0.0.1:8443</value>
            <value>Web service gftfe: 127.0.0.1:8443</value>
            <value>Shard List URL: 127.0.0.1:8443/scws/</value>
            <value>Protocol Version: 1.5.6</value>
            <value>Client Version: 1.2.0</value>
          </data>
        </array>
      </value>
    </param>
  </params>
</methodResponse>`;

    return response;
}

module.exports = {
    extractParamsFromRequest,
    extractParamsFromXmlRpc,
    createSrbResponse
};
