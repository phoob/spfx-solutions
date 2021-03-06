import { override } from '@microsoft/decorators';
import { Log } from '@microsoft/sp-core-library';
import {
    BaseApplicationCustomizer
} from '@microsoft/sp-application-base';
import { SPHttpClient, MSGraphClient } from '@microsoft/sp-http';
import { sp, Web, Site } from '@pnp/sp';
import { Dialog } from '@microsoft/sp-dialog';

import * as strings from 'GroupLogoApplicationCustomizerStrings';

export interface IGroupLogoApplicationCustomizerProperties {
    // This is an example; replace with your own property
    logoUrl: string;
}

/** A Custom Action which can be run during execution of a Client Side Application */
export default class GroupLogoApplicationCustomizer
    extends BaseApplicationCustomizer<IGroupLogoApplicationCustomizerProperties> {
    @override
    public onInit(): Promise<void> {
        if (typeof console == "undefined" || typeof console.log == "undefined") var console = { log: () => { } };
        this.context.placeholderProvider.changedEvent.add(this, () => { this.DoWork(this.properties.logoUrl); });
        return Promise.resolve();
    }

    /**
     *
     *
     * @private
     * @param {string} logoUrl
     * @returns
     * @memberof GroupLogoApplicationCustomizer
     */
    private async DoWork(logoUrl: string) {
        let isGroupOwner = this.context.pageContext.legacyPageContext.isSiteAdmin;
        if (!isGroupOwner) return;

        let response = await this.context.spHttpClient.post(`${logoUrl}/_api/contextinfo`, SPHttpClient.configurations.v1, {});
        if (!response.ok) return;
        let result = await response.json();

        // get web url from full path
        let webUrl = result.WebFullUrl;
        let web: Web = new Web(webUrl);
        let replace = `${window.location.protocol}//${window.location.hostname}`;
        let relativeUrlLogo = decodeURIComponent(logoUrl).replace(replace, "");
        let buffer = await web.getFileByServerRelativeUrl(relativeUrlLogo).getBuffer();

        let hasError = false;
        let groupId = this.context.pageContext.legacyPageContext.groupId;

        try {
            Dialog.alert(strings.SettingUp);
            let graphUrl = `/groups/${groupId}/photo/$value`;
            let graphClient: MSGraphClient = await this.context.msGraphClientFactory.getClient();
            // Url wont propagate from exchange, so also setting it directly on group
            this.setGroupLogo(buffer);
            let caller = await graphClient.api(graphUrl).version("v1.0").header("Content-Type", "image/jpeg").patch(buffer);
        } catch (err) {
            // Most likely due to user not having Exchange Online license or Group not ready
            hasError = true;
            throw err;
        }

        if (!hasError) {
            window.setTimeout(async () => {
                this.removeCustomizer();
            }, 3000);
        }
    }

    /**
     *
     *
     * @private
     * @memberof GroupLogoApplicationCustomizer
     */
    private async removeCustomizer() {
        // Remove custom action from current sute
        let site = new Site(this.context.pageContext.site.absoluteUrl);
        let customActions = await site.userCustomActions.get();
        for (let i = 0; i < customActions.length; i++) {
            var instance = customActions[i];
            if (instance.ClientSideComponentId === this.componentId) {
                await site.userCustomActions.getById(instance.Id).delete();
                console.log("Logo extension removed");
                break;
            }
        }
    }
    /**
     *
     *
     * @private
     * @param {*} fileBuffer
     * @memberof GroupLogoApplicationCustomizer
     */
    private async  setGroupLogo(fileBuffer: ArrayBuffer) {
        try {
            let requestUrl = this.context.pageContext.web.serverRelativeUrl + "/_api/groupservice/SetGroupImage";
            await this.context.spHttpClient.post(requestUrl, SPHttpClient.configurations.v1, { body: fileBuffer, headers: { 'Content-Type': 'image/png' } });
        } catch (error) {
            throw error;
        }
    }
}
