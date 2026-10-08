/*
 * Copyright (c) 2025 Finn Wolf
 * All rights reserved.
 */

const { DataBaseInterface } = require("./dataBaseInterface")

class EconomyManager extends DataBaseInterface {
    /**
     * @param {string} [filePath] SQLite database file shared with other managers.
     */
    constructor(filePath) {
        super(filePath)
        //Add Coins to User
        this.addCoins = async function (userId, amount) {
            return await this.addUserValue(userId, ".balance", amount)
        }

        //Set Users Coins Amount
        this.setCoins = async function (userId, value) {
            return await this.setUserValue(userId, ".balance", value)
        }

        //Remove Coins from User
        this.removeCoins = async function (userId, amount) {
            return await this.removeUserValue(userId, ".balance", amount)
        }

        //Get Users Balance
        this.getUserBalance = async function (userId) {
            const userData = await this.getObject(userId)
            if (userData == null) {
                return null
            }
            return userData.balance
        }

        //Get Total Amount of Coins in Database
        this.getTotalCoinAmount = async function () {
            const entireDatabase = await this.fetchAll()
            let totalCoinAmount = 0
            for (const { value } of entireDatabase) {
                if (Number.isFinite(value?.balance)) {
                    totalCoinAmount += value.balance
                }
            }
            return totalCoinAmount
        }

        //Get Users with nonzero balances in ascending order for the leaderboard
        this.getTopUsers = async function () {
            const userDatabase = await this.fetchAll()
            return userDatabase
                .filter(user => Number.isFinite(user.value?.balance) && user.value.balance !== 0)
                .sort((a, b) => a.value.balance - b.value.balance)
        }

        //Add Daily Amount to User
        this.addDailyAmount = async function (userId, amount) {
            return await this.addUserValue(userId, ".daily", amount)
        }

        //Set Users Daily Amount
        this.setDailyAmount = async function (userId, value) {
            return await this.setUserValue(userId, ".daily", value)
        }

        //Remove Daily Amount from User
        this.removeDailyAmount = async function (userId, amount) {
            return await this.removeUserValue(userId, ".daily", amount)
        }

        //Get Users Daily
        this.getUserDaily = async function (userId) {
            const userData = await this.getObject(userId)
            if (userData == null) {
                return null
            }
            return userData.daily
        }

        //Reset all Dailys
        this.resetAllDailyAmounts = async function () {
            const entireDatabase = await this.fetchAll()
            for (const { value, id } of entireDatabase) {
                if (value?.daily) {
                    await this.setDailyAmount(id, 0)
                }
            }
        }
    }
}

module.exports = {
    EconomyManager
}
