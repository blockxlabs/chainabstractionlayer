import { flatten } from 'lodash'
import JsonRpcProvider from '../JsonRpcProvider'

export default class BitcoinRPCProvider extends JsonRpcProvider {
  async decodeRawTransaction (rawTransaction) {
    const data = await this.jsonrpc('decoderawtransaction', rawTransaction)
    const { hash: txHash, txid: hash, vout } = data
    const value = vout.reduce((p, n) => p + parseInt(n.value), 0)

    const output = { hash, value, _raw: { hex: rawTransaction, data, txHash } }

    return output
  }

  async isUsedAddress (address) {
    const utxo = await this.getUnspentTransactions(address)

    return utxo.length !== 0
  }

  async getBalance (addresses) {
    const _utxos = await Promise.all(addresses.map(address => this.getUnspentTransactions(address)))
    const utxos = flatten(_utxos)
    return utxos.reduce((acc, utxo) => acc + (utxo.amount * 1e8), 0)
  }

  async getUnspentTransactions (address) {
    return this.jsonrpc('listunspent', 6, 9999999, [ address ])
  }

  async getTransactionHex (transactionHash) {
    return (await this.jsonrpc('gettransaction', transactionHash)).hex
  }

  async generateBlock (numberOfBlocks) {
    return this.jsonrpc('generate', numberOfBlocks)
  }

  async getBlockByHash (blockHash, includeTx) {
    const data = await this.jsonrpc('getblock', blockHash)
    const { hash,
      height: number,
      time: timestamp,
      difficulty,
      size,
      previousblockhash: parentHash,
      nonce,
      confirmations } = data
    let { tx: transactions } = data

    if (includeTx) {
      const txs = transactions.map(this.getMethod('getRawTransactionByHash'))
      transactions = await Promise.all(txs)
    }

    return { hash,
      number,
      timestamp,
      difficulty,
      size,
      parentHash,
      nonce,
      transactions,
      confirmations }
  }

  async getBlockByNumber (blockNumber, includeTx) {
    return this.getBlockByHash(await this.jsonrpc('getblockhash', blockNumber), includeTx)
  }

  async getBlockHeight () {
    return this.rpc('getblockcount')
  }

  async getTransactionByHash (transactionHash) {
    const rawTx = await this.getRawTransactionByHash(transactionHash)
    const tx = await this.decodeRawTransaction(rawTx)
    try {
      const data = await this.jsonrpc('gettransaction', transactionHash)
      const { confirmations } = data
      const output = Object.assign({}, tx, { confirmations })

      if (confirmations > 0) {
        const { blockhash: blockHash } = data
        const { number: blockNumber } = await this.getBlockByHash(blockHash)
        Object.assign(output, { blockHash, blockNumber })
      }

      return output
    } catch (e) {
      const output = Object.assign({}, tx)

      return output
    }
  }

  async getRawTransactionByHash (transactionHash) {
    return this.jsonrpc('getrawtransaction', transactionHash)
  }

  async isAddressUsed (address) {
    const getReceivedByAddress = this.rpc('getreceivedbyaddress', address)

    return parseFloat(getReceivedByAddress) > 0
  }

  async sendRawTransaction (rawTransaction) {
    return this.jsonrpc('sendrawtransaction', rawTransaction)
  }
}
