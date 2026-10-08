/*
 * Copyright (c) 2025 Finn Wolf
 * All rights reserved.
 */

const { Axios } = require("./axios");
const { Password } = require("./passwordGenerator");
const { DataBaseInterface } = require("./dataBaseInterface");
const axiosInstance = require("axios");
const database = new DataBaseInterface();
const serverDeletionOffset = process.env.DELETION_OFFSET;
class PanelManager {
  /**
   * Handles the communication between the Panel and the Bot
   *
   * @param {*} link
   * @param {*} apiKey
   * @param {*} accountKey
   * @param {Axios} this.axios
   */
  constructor(link, apiKey, accountKey) {
    this.axios = new Axios(axiosInstance, link, apiKey, accountKey);

    // Retry Wrapper
    this._withRetries = async function (fn, maxAttempts = 3) {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await fn();
        } catch (e) {
          const statusCode = e && e.response && e.response.status;
          if ((statusCode === 504 || statusCode === 502 || statusCode === 503) && attempt < maxAttempts) {
            // backoff
            await new Promise((r) => setTimeout(r, attempt * 1000));
            continue;
          }
          throw e;
        }
      }
    };

    //Check if User has an Account
    this.checkAccount = async function (eMail) {
      const userDataObject = await this.axios.get(
        `/api/application/users?filter[email]=${encodeURIComponent(eMail)}&include=servers&per_page=10000`,
        "application"
      );
      const userData = userDataObject.data.data.find(user => user.attributes.email == eMail)
      return userData;
    };

    //Add User to Panel
    this.addUser = async function (
      eMail,
      username,
      firstName,
      lastName,
      passkey
    ) {
      let password;
      passkey
        ? (password = passkey)
        : (password = await new Password().generatePassword(10));
      return await this.axios.post(
        `/api/application/users`,
        {
          email: eMail,
          username: username,
          first_name: firstName,
          last_name: lastName,
          password: password,
        },
        "application"
      )
    };

    //Remove User from Panel
    this.removeUser = async function (eMail) {
      const userAccountData = await this.checkAccount(eMail);
      if (!userAccountData) return
      const user = userAccountData.attributes.id;
      return await this.axios.delete(
        `/api/application/users/${user}`,
        "application"
      );
    };

    //Reset User Password
    this.resetUserPassword = async function (eMail, passkey) {
      let password;
      passkey
        ? (password = passkey)
        : (password = await new Password().generatePassword(15));
      const userAccountData = await this.checkAccount(eMail);
      const userData = userAccountData.attributes;
      let { username, first_name, last_name } = userData
      let awaitAxiosData = await this.axios.patch(
        `/api/application/users/${userData.id}`,
        {
          email: eMail,
          username: username,
          first_name: first_name,
          last_name: last_name,
          password: password,
        },
        "application"
      );
      return {
        data: awaitAxiosData,
        passkey: password
      }
    };

    //Get Nodes on Panel
    this.getPanelNodes = async function () {
      let nodeArray = new Array();
      const nodeData = await this.axios.get(
        `/api/application/nodes?per_page=10000&include=servers`,
        "application"
      );
      nodeArray = nodeData.data.data.map(node => node)
      return nodeArray;
    };

    //Get Allocations from Node
    this.getAllocations = async function (nodeId) {
      const allocationData = await this.axios.get(
        `/api/application/nodes/${nodeId}/allocations?per_page=10000`,
        "application"
      );
      return allocationData.data.data;
    };

    //Get Nest-Data from Panel
    this.getNestData = async function (eggId) {
      const nestData = await this.axios.get(
        `/api/application/nests?per_page=10000&include=eggs`,
        "application"
      );
      return nestData.data.data;
    };

    //Get Egg Data from Panel
    this.getEggData = async function (eggId, nestId) {
      const eggData = await this.axios.get(
        `/api/application/nests/${nestId}/eggs/${eggId}?per_page=10000&include=config,script,variables`,
        "application"
      );
      return eggData.data;
    };

    //Create Server
    this.createServer = async function (eMail, serverName, eggId, memoryAmount, swapAmount, diskAmount, ioValue, cpuPercentage, databaseAmount, backupAmount) {
      // Get User Data (with retries)
      const userData = await this._withRetries(() => this.checkAccount(eMail));
      if (!userData) throw new Error(`Panel createServer: user not found for email=${eMail}`);
      // Get Node Data
      const nodeData = await this._withRetries(() => this.getPanelNodes());
      if (!nodeData || !Array.isArray(nodeData) || nodeData.length === 0) throw new Error(`Panel createServer: no node data returned from panel`);
      // Get Amount of Servers on each Node
      const nodeServerAmount = nodeData.map(node => node.attributes.relationships.servers.data.length);
      // Get Node with least amount of Servers
      const lowestNode = nodeData[nodeServerAmount.indexOf(Math.min(...nodeServerAmount))];
      if (!lowestNode) throw new Error(`Panel createServer: could not determine lowestNode from nodeData`);
      // Get Allocations on Node
      const allocations = await this._withRetries(() => this.getAllocations(lowestNode.attributes.id));
      if (!allocations || !Array.isArray(allocations)) throw new Error(`Panel createServer: no allocations returned for node ${lowestNode && lowestNode.attributes && lowestNode.attributes.id}`);
      //Get Free Allocations
      const freeAllocations = allocations.filter(allocation => allocation.attributes.assigned == false)
      const freeAllocationIds = freeAllocations.map(allocation => allocation.attributes.id)
      if (!freeAllocationIds || freeAllocationIds.length === 0) throw new Error(`Panel createServer: no free allocations available on node ${lowestNode && lowestNode.attributes && lowestNode.attributes.id}`);
      //Get Nests
      const nestData = await this.getNestData();
      //Get chosen Egg Data
      const chosenNestData = nestData.find(nest => nest.attributes.relationships.eggs.data.some(egg => egg.attributes.id == eggId))
      if (!chosenNestData) throw new Error(`Panel createServer: chosenNestData not found for eggId=${eggId}`);
      const chosenEggData = chosenNestData.attributes.relationships.eggs.data.find(egg => egg.attributes.id == eggId)
      if (!chosenEggData) throw new Error(`Panel createServer: chosenEggData not found for eggId=${eggId}`);
      //Retreive Egg Enviroment Variables
      const complexEggData = await this._withRetries(() => this.getEggData(
        eggId,
        chosenEggData.attributes.nest
      ));
      if (!complexEggData) throw new Error(`Panel createServer: complexEggData missing for eggId=${eggId}`);
      const enviromentVariables =
        complexEggData.attributes.relationships.variables.data;
      const populatedEnviromentVariables = new Object();
      for (let variable of enviromentVariables) {
        //Check if Enviroment Variable is required
        if (variable.attributes.rules.includes("required"))
          populatedEnviromentVariables[
            variable.attributes.env_variable
          ] = variable.attributes.default_value;
      }
      //Create Server (with retries)
      return await this._withRetries(() => this.axios.post(
        `/api/application/servers`,
        {
          name: serverName,
          user: userData.attributes.id,
          egg: eggId,
          docker_image: complexEggData.attributes.docker_image,
          startup: chosenEggData.attributes.startup,
          environment: populatedEnviromentVariables,
          limits: {
            memory: memoryAmount,
            swap: swapAmount,
            disk: diskAmount,
            io: ioValue,
            cpu: cpuPercentage,
          },
          feature_limits: {
            databases: databaseAmount,
            backups: backupAmount,
          },
          allocation: {
            default: freeAllocationIds[Math.floor(Math.random() * freeAllocationIds.length)]
          },
        },
        "application"
      ));
    };

    //Delete Server
    this.deleteServer = async function (serverId) {
      const responseData = await this.axios.delete(
        `/api/application/servers/${serverId}`,
        "application"
      );
      return responseData.data;
    };

    //Get all Servers from a User
    this.getAllServers = async function (eMail) {
      const userData = await this.checkAccount(eMail);
      return userData ? userData.attributes.relationships.servers.data : null;
    };

    //Check if server is still being installed
    this.getInstallStatus = async function (serverIdentifier) {
      let serverUsage;
      try {
        serverUsage = await this.axios.get(`/api/client/servers/${serverIdentifier}/resources`, "client")
        return true
      } catch (e) { return false }
    }

    //Get Live Ressource Usage from a specific Server
    this.liveServerRessourceUsage = async function (serverId) {
      let serverUsage;
      try {
        serverUsage = await this.axios.get(
          `/api/client/servers/${serverId}/resources`,
          "client"
        );
        return serverUsage.data;
      } catch (e) { return undefined }
    };

    //Get Info from specific Server
    this.getServerInfo = async function (serverIdentifier) {
      const serverData = await this.axios.get(
        `/api/client/servers/${serverIdentifier}`,
        "client"
      );
      return serverData.data;
    };

    //Power Up / Down Server
    this.powerEventServer = async function (serverIdentifier, type) {
      const responseData = await this.axios.post(
        `/api/client/servers/${serverIdentifier}/power`,
        {
          signal: type,
        },
        "client"
      );
      return responseData.data;
    };

    //Reinstall Server
    this.reinstallServer = async function (serverIdentifier) {
      const responseData = await this.axios.post(
        `/api/client/servers/${serverIdentifier}/settings/reinstall`,
        {},
        "client"
      );
      return responseData.data;
    };

    //Rename Server
    this.renameServer = async function (serverIdentifier, newName) {
      const responseData = await this.axios.post(
        `/api/client/servers/${serverIdentifier}/settings/rename`,
        {
          name: newName,
        },
        "client"
      );
      return responseData.data;
    };

    //Get Server ID from UUID
    this.getServerId = async function (uuid) {
      const responseData = await this.axios.get(
        `/api/application/servers?per_page=10000`, "application"
      );
      const serverData = responseData.data.data.find(server => server.attributes.uuid == uuid)
      if (!serverData) return null
      let { attributes: { id } } = serverData
      return id;
    };

    //Get Server ID from UUID
    this.getServerIdentifier = async function (uuid) {
      const responseData = await this.axios.get(
        `/api/application/servers?per_page=10000`, "application"
      );
      const serverData = responseData.data.data.find(server => server.attributes.uuid == uuid)
      if (!serverData) return null
      let { attributes: { identifier } } = serverData
      return identifier;
    };

    //Suspend Server
    this.suspendServer = async function (serverId) {
      const responseData = await this.axios.post(
        `/api/application/servers/${serverId}/suspend`,
        {},
        "application"
      );
      return responseData.data;
    };

    //Unsuspend Server
    this.unSuspendServer = async function (serverId) {
      const responseData = await this.axios.post(
        `/api/application/servers/${serverId}/unsuspend`,
        {},
        "application"
      );
      return responseData.data;
    };

    //Server Runtimes

    //Add Server to Runtime List
    this.setServerRuntime = async function (
      serverUuid,
      runtime,
      userId,
      serverPrice
    ) {
      const runtimeObject = {
        uuid: serverUuid,
        user_id: userId,
        runtime: runtime,
        price: serverPrice,
        date_created: {
          date: new Date(),
        },
        date_running_out: {
          date: new Date(new Date().getTime() + runtime * 86400000),
        },
      };
      return await database.pushObject(
        "runtime_server_list",
        runtimeObject
      );
    };

    //Set Runtime List
    this.setRuntimeList = async function (data) {
      return await database.setObject("runtime_server_list", data);
    };

    //Get Runtime List
    this.getRuntimeList = async function () {
      const list = await database.getObject("runtime_server_list");
      if (!list) return null
      return list
    };

    //Remove Server from Suspension List
    this.removeServerSuspensionList = async function (serverUuid) {
      const runtimeList = (await this.getRuntimeList()) ?? [];
      const newRuntimeList = runtimeList.filter(server => server.uuid != serverUuid)
      await this.setRuntimeList(newRuntimeList);
    };

    //Add Server to Deletion List ( from Suspension List)
    this.addServerDeletion = async function (serverUuid, runtime, userId, serverPrice) {
      const runtimeList = await this.getRuntimeList();
      const selectedServer = runtimeList.find(server => server.uuid == serverUuid)
      let { date_running_out, date_created } = selectedServer
      return await database.pushObject("delete_server_list", {
        uuid: serverUuid,
        user_id: userId,
        runtime: runtime,
        price: serverPrice,
        date_created: date_created,
        deletion_date: {
          date: new Date(
            new Date(date_running_out.date).getTime() +
            serverDeletionOffset * 86400000
          ),
        }
      });
    }

    //Set Deletion List
    this.setDeletionList = async function (data) {
      return await database.setObject("delete_server_list", data);
    };

    /**
     * 
     * Get full List of all Servers which are on the Deletion-List
     * 
     * @returns null if the Deletion-List is empty. Instead returns the List if it is not.
     */
    this.getDeletionList = async function () {
      const list = await database.getObject("delete_server_list");
      if (!list) return null
      return list
    };

    /**
     * 
     * Removes a specific Server from the Deletion List
     * 
     * @param {} serverUuid Panel UUID of the specific Server
     * @returns null if the Deletion-List is emtpy. Else nothing is returned.
     */
    this.removeServerDeletionList = async function (serverUuid) {
      const deletionList = await this.getDeletionList();
      if (!deletionList) return null
      const newDeletionList = deletionList.filter(server => server.uuid != serverUuid)
      await this.setDeletionList(newDeletionList);
    };

    /**
     * 
     * Get all Runtime specific Data from a specific Server from the Database
     * 
     * @param {} serverIdentifier Short panel Identifier of the Server
     * @returns the Suspension or Deletion Data of the Server
     */
    this.getServerRuntime = async function (serverIdentifier) {
      const serverData = await this.getServerInfo(serverIdentifier);
      const serverUuid = serverData.attributes.uuid;

      const runtimeList = await this.getRuntimeList();
      const deletionList = await this.getDeletionList();

      if (runtimeList != null) {
        for (let server of runtimeList)
          if (server.uuid == serverUuid)
            return {
              status: true,
              type: "suspension",
              data: server,
            };
      }

      if (deletionList != null) {
        for (let server of deletionList)
          if (server.uuid == serverUuid)
            return {
              status: true,
              type: "deletion",
              data: server,
            };
      }

      return {
        status: false,
        type: "error",
      };
    };


    /**
     * 
     * Extends a Servers Runtime from previously already having a runtime
     * 
     * @param {} serverIdentifier Short Panel Identifier of the Server
     * @param {} runtimeExtension Amount of Days the Server should be extended
     * @returns the Database Action
     */
    this.extendRuntime = async function (serverIdentifier, runtimeExtension) {
      const suspensionList = (await this.getRuntimeList()) ?? [];
      const deletionList = (await this.getDeletionList()) ?? [];
      const serverData = await this.getServerInfo(serverIdentifier);
      const serverUuid = serverData.attributes.uuid;

      //Server needs to be extended from runtime List
      for (let server of suspensionList)
        if (server.uuid == serverUuid) {
          await this.removeServerSuspensionList(serverUuid);
          return await database.pushObject("runtime_server_list", {
            uuid: serverUuid,
            user_id: server.user_id,
            runtime: server.runtime,
            price: server.price,
            date_created: server.date_created,
            date_running_out: {
              date: new Date(
                new Date(
                  server.date_running_out.date
                ).getTime() +
                runtimeExtension * 86400000
              ),
            },
          });
        }

      //Server needs to be extended from deletion List
      for (let server of deletionList)
        if (server.uuid == serverUuid) {
          await this.removeServerDeletionList(serverUuid);
          return await database.pushObject("runtime_server_list", {
            uuid: serverUuid,
            user_id: server.user_id,
            runtime: server.runtime,
            price: server.price,
            date_created: server.date_created,
            date_running_out: {
              date: new Date(
                new Date(server.deletion_date.date).getTime() +
                runtimeExtension * 86400000
              ),
            },
          });
        }
    };

    /**
     * 
     * Deletes all Servers from a specific User of the Panel
     * 
     * @param {*} eMail The E-Mail of the User 
     * @returns Nothing
     */
    this.deleteAllServers = async function (eMail) {
      const userServers = await this.getAllServers(eMail);
      if (!userServers || userServers.length == 0) return
      for (let server of userServers) {
        await this.deleteServer(server.attributes.id);
        try {
          await this.removeServerSuspensionList(
            server.attributes.uuid
          );
          await this.removeServerDeletionList(
            server.attributes.uuid
          );
        } catch (e) { }
      }
    };


    /**
     * 
     * @returns A filtered List of all UUID of Servers who are owned by a User in the User-Database of the Bot
     */
    this.getAccumulatedUserServers = async function () {
      const records = await database.fetchAll()
      const users = records.filter((object) => {
        if (object.id.length == 18) return true
      }).map(user => user.value.e_mail)

      //Get All Servers from the Panel
      let allServers = await this.axios.get("/api/application/servers?per_page=10000&include=user", "application")
      const serverList = []

      for (let i = 0; i < allServers.data.data.length; i++) {
        if (users
          .includes(allServers.data.data[i].attributes.relationships.user.attributes.email)) {
          serverList.push(allServers.data.data[i].attributes.uuid)
        }
      }

      return serverList ?? null

    }

    /**
     * 
     * Retreive a Users Discord ID via a Servers UUID
     * 
     * @param {*} uuid The UUID of the Server
     * @returns the Discord id of the User or null if the Server does not belong to a User.
     */
    this.getUserIDfromUUID = async function (uuid) {
      const records = await database.fetchAll()
      const users = records.filter((object) => {
        if (object.id.length == 18) return true
      })
      const userEmails = users.map(user => user.value.e_mail)

      //Get Server Data
      const serverId = await this.getServerId(uuid)
      let server = await this.axios.get(`/api/application/servers/${serverId}?include=user`, "application")

      let email = server.data.attributes.relationships.user.attributes.email

      let index = userEmails.indexOf(email)

      let id = users[index].id

      return id
    }

    /**
 * 
 * Check if a Client API Key is valid and retreive connected Account E-Mail
 * 
 * @param {*} key API Key
 * @returns E-Mail of connected Account or null (if Account does not exist)
 */
    this.getUserEmailFromAPIKey = async function (key) {
      const records = await database.fetchAll()
      const users = records.filter((object) => {
        if (object.id.length == 18) return true
      })

      const userEmails = users.map(user => user.value.e_mail)

      let accountData = null;
      let tempAxios = new Axios(axiosInstance, link, apiKey, key);
      try {
        accountData = await tempAxios.get(`/api/client/account`, "client")
      } catch (e) {
        return null;
      }
      if (!accountData) return null;
      let eMail = accountData.data.attributes.email;
      if (!eMail) return null;
      return eMail;
    }


    /**
 * 
 * Check if a Local Database Entry for an E-Mail is present
 * 
 * @param {*} eMail E-Mail
 * @returns true or false
 */
    this.checkLocalAccount = async function (eMail) {
      if (!eMail) return false;
      const normalizedEmail = String(eMail).toLowerCase();
      const records = await database.fetchAll();
      if (!Array.isArray(records) || records.length === 0) return false;

      const users = records.filter((obj) => obj && obj.id && String(obj.id).length === 18);

      const found = users.find((u) => u.value && u.value.e_mail && String(u.value.e_mail).toLowerCase() === normalizedEmail);
      return !!found;
    };

  }
}



module.exports = {
  PanelManager,
};
