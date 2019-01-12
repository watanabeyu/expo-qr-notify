const fetch = require('node-fetch');

module.exports = async ({ url, iosManifest, config }) => {
  const {
    iconUrl,
    version,
    releaseChannel,
    name,
    primaryColor,
  } = iosManifest;

  const publishURL = releaseChannel === 'default' ? url : `${url}?release-channel=${encodeURIComponent(releaseChannel)}`;
  const qrURL = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${publishURL}`;

  /* github */
  const gitServiceToken = process.env.GIT_SERVICE_TOKEN || config.git_service_token;
  const prNumber = process.env.CIRCLE_PULL_REQUEST ? process.env.CIRCLE_PULL_REQUEST.split('/').pop(-1) : null;
  let htmlURL = null;
  let prTitle = null;

  if (gitServiceToken) {
    if (prNumber) {
      try {
        const response = await fetch(`https://api.github.com/repos/${process.env.CIRCLE_PROJECT_USERNAME}/${process.env.CIRCLE_PROJECT_REPONAME}/issues/${prNumber}/comments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `token ${gitServiceToken}`,
          },
          body: JSON.stringify({
            body: `v${version} ${publishURL}\n\n![QRURL](${qrURL})`,
          }),
        }).then(res => res.json());

        await fetch(`https://api.github.com/repos/${process.env.CIRCLE_PROJECT_USERNAME}/${process.env.CIRCLE_PROJECT_REPONAME}/pulls/${prNumber}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `token ${gitServiceToken}`,
          },
        }).then(res => res.json()).then((r) => { prTitle = r.title; });

        htmlURL = response.html_url;
      } catch (e) {
        console.log('error:', e);
      }
    }
  } else {
    console.log('process.env.GITHUB_TOKEN || app.json.hooks.postpublish[].config.github_token not set');
  }

  /* slack */
  const slack = {
    webhook: process.env.SLACK_WEBHOOK || config.slack_webhook,
    channel: process.env.SLACK_CHANNEL || config.slack_channel,
  };

  if (slack.webhook && slack.channel) {
    try {
      await fetch(slack.webhook, {
        method: 'post',
        body: JSON.stringify({
          icon_url: iconUrl,
          unfurl_links: 0,
          username: name,
          channel: slack.channel || '',
          attachments: [{
            color: primaryColor || '',
            title: process.env.CIRCLE_PULL_REQUEST && `#${prNumber} ${prTitle}`,
            title_link: process.env.CIRCLE_PULL_REQUEST || null,
            text: publishURL,
            image_url: qrURL,
            fields: [{
              title: `v${version}`,
            }],
            footer: (prNumber && htmlURL) && htmlURL,
            ts: (prNumber && htmlURL) && (new Date().getTime() / 1000),
          }],
        }),
      });
    } catch (e) {
      console.log('error:', e);
    }
  } else {
    console.log('process.env.SLACK_WEBHOOK || app.json.hooks.postpublish[].config.slack_webhook not set');
    console.log('process.env.SLACK_CHANNEL || app.json.hooks.postpublish[].config.slack_channel not set');
  }
};
