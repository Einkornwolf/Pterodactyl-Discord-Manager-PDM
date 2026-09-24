/*
 * Copyright (c) 2025 Finn Wolf
 * All rights reserved.
 */

const { DataBaseInterface } = require("./dataBaseInterface")

class EconomyManager extends DataBaseInterface {
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
            if (userData == null) return null
            return userData.balance
        }

        //Get Total Amount of Coins in Database
        this.getTotalCoinAmount = async function () {
            const entireDatabase = await this.fetchAll()
            let totalCoinAmount = 0
            for (let object of entireDatabase) {
                let { value: { balance } } = object
                if (object) if (balance != undefined) totalCoinAmount += balance
            }
            return totalCoinAmount
        }

        //Get List of top Users in Reversed Order
        this.getTopUsers = async function () {
            let userDatabase = await this.fetchAll()
            await userDatabase.sort(function (a, b) { if (a.value.balance == undefined) return -Infinity; return a.value.balance - b.value.balance })
            userDatabase = userDatabase.filter(user => {               // Kein Key = kein gültiger User
                if (!user.value?.balance) return false;        // Kein Balance-Feld = überspringen          // z. B. falls Key keine Discord-ID ist
                return true;
            });
            return userDatabase
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
            return userData.daily
        }

        //Reset all Dailys
        this.resetAllDailyAmounts = async function () {
            const entireDatabase = await this.fetchAll()
            for (let object of entireDatabase) {
                let { value: { daily }, id } = object
                if (daily) await this.setDailyAmount(id, 0)
            }
        }




    }
}

module.exports = {
    EconomyManager
}