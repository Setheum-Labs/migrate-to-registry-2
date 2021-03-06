'use strict'

const fs = require('fs')
const path = require('path')
const chalk = require('chalk')
const figures = require('figures')
const co = require('co')
const api = require('./lib/api')
const {fromWei} = require('@parity/parity.js').Api.util
const postToContract = require('./lib/post-to-contract')
const waitForConfirmations = require('./lib/wait-for-confirmations')

const abi = JSON.parse(fs.readFileSync(path.join(__dirname, 'contracts/SimpleRegistry.sol:SimpleRegistry.abi'), {encoding: 'utf8'}))
const reserve = abi.find((item) => item.name === 'reserve')
const setAddress = abi.find((item) => item.name === 'setAddress')
const setData = abi.find((item) => item.name === 'setData')
const proposeReverse = abi.find((item) => item.name === 'proposeReverse')
const transfer = abi.find((item) => item.name === 'transfer')
// added by ethcore/contracts#31
const confirmReverseAs = abi.find((item) => item.name === 'confirmReverseAs')

const tick = chalk.green(figures.tick)

const migrate = co.wrap(function* (registryAddress, registryOwner, data) {
  const {names, reverses} = data // todo: proposedReverses

  const registry = api.newContract(abi, registryAddress)
  const fee = yield registry.instance.fee.call({}, [])
  console.info('fee is', fromWei(fee).toNumber(), 'ETH')

  for (let nameHash in names) {
    const {data} = names[nameHash]

    console.info('registering', nameHash)
    const tx1 = yield postToContract(registryOwner, registryAddress, reserve, [nameHash], fee)
    yield waitForConfirmations(tx1)
    console.info(tick, chalk.gray(tx1))

    for (let key in data) {
      const value = data[key]
      console.info('\t', key, '->', value)

      let tx
      if (key.toUpperCase() === 'A') {
        tx = yield postToContract(registryOwner, registryAddress, setAddress, [nameHash, key, value])
      } else {
        tx = yield postToContract(registryOwner, registryAddress, setData, [nameHash, key, value])
      }
      yield waitForConfirmations(tx)
      console.info('\t', tick, chalk.gray(tx1))
    }
  }

  for (let address in reverses) {
    const name = reverses[address]

    console.info('proposing', name, 'for', address)
    const tx1 = yield postToContract(registryOwner, registryAddress, proposeReverse, [name, address])
    yield waitForConfirmations(tx1)
    console.info(tick, chalk.gray(tx1))

    console.info('confirming', name, 'for', address)
    const tx2 = yield postToContract(registryOwner, registryAddress, confirmReverseAs, [name, address])
    yield waitForConfirmations(tx2)
    console.info(tick, chalk.gray(tx2))
  }

  for (let nameHash in names) {
    const {owner} = names[nameHash]

    console.info('transferring', nameHash)
    const tx1 = yield postToContract(registryOwner, registryAddress, transfer, [nameHash, owner])
    yield waitForConfirmations(tx1)
    console.info(tick, chalk.gray(tx1))
  }
})

module.exports = migrate
