/*
 * Copyright (c) 2025 Finn Wolf
 * All rights reserved.
 */

const { AxiosDataGenerator } = require("./axiosDataGenerator");
const axiosParam = require("axios");

class Axios {
  /**
   * Handles Axios HTTP Requests and communicates with the Pterodactyl Panel
   *
   * @param {axiosParam.Axios} axiosInstance
   * @param {String} baseLink
   * @param {String} applicationAuthKey
   * @param {String} clientAuthKey
   */
  constructor(axiosInstance, baseLink, applicationAuthKey, clientAuthKey) {
    //Get Application Axios Config
    this.applicationConfigGenerator = new AxiosDataGenerator(applicationAuthKey);
    this.applicationConfig = this.applicationConfigGenerator.generateConfig();
    //Get Client Axios Config
    this.clientConfigGenerator = new AxiosDataGenerator(clientAuthKey);
    this.clientConfig = this.clientConfigGenerator.generateConfig();

    //Axios Get
    this.get = async function (linkExtension, type) {
      switch (type) {
        case `application`:
          return await axiosInstance.get(
            `${baseLink}${linkExtension}`,
            this.applicationConfig
          );
        case `client`: {
          return await axiosInstance.get(
            `${baseLink}${linkExtension}`,
            this.clientConfig
          );
        }
        default:
          return null;
      }
    };

    //Axios Post
    this.post = async function (linkExtension, data, type) {
      switch (type) {
        case `application`:
          return await axiosInstance.post(
            `${baseLink}${linkExtension}`,
            data,
            this.applicationConfig
          );
        case `client`: {
          return await axiosInstance.post(
            `${baseLink}${linkExtension}`,
            data,
            this.clientConfig
          );
        }
        default:
          return null;
      }
    };

    //Axios Delete
    this.delete = async function (linkExtension, type) {
      switch (type) {
        case `application`:
          return await axiosInstance.delete(
            `${baseLink}${linkExtension}`,
            this.applicationConfig
          );
        case `client`: {
          return await axiosInstance.delete(
            `${baseLink}${linkExtension}`,
            this.clientConfig
          );
        }
        default:
          return null;
      }
    };

    //Axios Patch
    this.patch = async function (linkExtension, data, type) {
      switch (type) {
        case `application`:
          return await axiosInstance.patch(
            `${baseLink}${linkExtension}`,
            data,
            this.applicationConfig
          );
        case `client`: {
          return await axiosInstance.patch(
            `${baseLink}${linkExtension}`,
            data,
            this.clientConfig
          );
        }
        default:
          return null;
      }
    };
  }
}

module.exports = {
  Axios,
};
