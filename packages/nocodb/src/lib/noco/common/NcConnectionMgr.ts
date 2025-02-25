import {XKnex} from "../../dataMapper";
import {NcConfig} from "../../../interface/config";
import fs from "fs";
import Knex from "knex";

import {SqlClientFactory} from 'nc-help';
import NcMetaIO from "../meta/NcMetaIO";

export default class NcConnectionMgr {
  private static connectionRefs: {
    [projectId: string]: {
      [env: string]: {
        [dbAlias: string]: XKnex
      }
    }
  } = {};

  private static metaKnex: NcMetaIO;

  public static setXcMeta(ncMeta: NcMetaIO) {
    this.metaKnex = ncMeta;
  }

  public static get({
                      dbAlias = 'db',
                      env = 'dev',
                      config,
                      projectId
                    }: {
    dbAlias: string,
    env: string,
    config: NcConfig,
    projectId: string
  }): XKnex {
    if (this.connectionRefs?.[projectId]?.[env]?.[dbAlias]) {
      return this.connectionRefs?.[projectId]?.[env]?.[dbAlias];
    }
    this.connectionRefs[projectId] = this.connectionRefs[projectId] || {};
    this.connectionRefs[projectId][env] = this.connectionRefs[projectId] [env] || {};
    if (config?.prefix && this.metaKnex) {
      this.connectionRefs[projectId][env][dbAlias] = this.metaKnex?.knex;
    } else {
      const connectionConfig = this.getConnectionConfig(config, env, dbAlias)

      if (connectionConfig?.connection?.ssl && typeof connectionConfig?.connection?.ssl === 'object') {
        if (connectionConfig.connection.ssl.caFilePath) {
          connectionConfig.connection.ssl.ca = fs
            .readFileSync(connectionConfig.connection.ssl.caFilePath)
            .toString();
        }
        if (connectionConfig.connection.ssl.keyFilePath) {
          connectionConfig.connection.ssl.key = fs
            .readFileSync(connectionConfig.connection.ssl.keyFilePath)
            .toString();
        }
        if (connectionConfig.connection.ssl.certFilePath) {
          connectionConfig.connection.ssl.cert = fs
            .readFileSync(connectionConfig.connection.ssl.certFilePath)
            .toString();
        }
      }

      const isSqlite = connectionConfig?.client === 'sqlite3';

      if (connectionConfig?.connection?.port) {
        connectionConfig.connection.port = +connectionConfig.connection.port
      }

      this.connectionRefs[projectId][env][dbAlias] = XKnex(isSqlite ?
        connectionConfig.connection as Knex.Config :
        {
          ...connectionConfig,
          connection: {
            ...connectionConfig.connection,
            typeCast(_field, next) {
              const res = next();
              if (res instanceof Buffer) {
                return [...res].map(v => ('00' + v.toString(16)).slice(-2)).join('');
              }
              return res;
            }
          }
        } as any);
      if (isSqlite) {
        this.connectionRefs[projectId][env][dbAlias].raw(`PRAGMA journal_mode=WAL;`).then(() => {
        })
      }
    }
    return this.connectionRefs[projectId][env][dbAlias];
  }


  private static getConnectionConfig(config: NcConfig, env: string, dbAlias: string) {
    return config?.envs?.[env]?.db?.find(db => db?.meta?.dbAlias === dbAlias);
  }

  public static getSqlClient({
                               projectId,
                               dbAlias = 'db',
                               env = 'dev',
                               config
                             }: {
    dbAlias: string,
    env: string,
    config: NcConfig,
    projectId: string
  }): any {
    const knex = this.get({
      dbAlias,
      env,
      config,
      projectId
    })
    return SqlClientFactory.create({knex, ...this.getConnectionConfig(config, env, dbAlias)})
  }
}



