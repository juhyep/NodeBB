


import fs from 'fs';
import path from 'path';
import winston from 'winston';
import validator from 'validator';

import { baseDir } from '../constants';
import db from '../database';
import plugins from '../plugins';
import batch from '../batch';

interface UserType {
    logIP: (uid: string, ip: string) => Promise<void>;
    getIPs: (uid: string, stop: number) => Promise<string[]>;
    getUsersCSV: () => Promise<string>;
    getUsersFields: any;
    exportUsersCSV: () => Promise<void>;
}



export = function (User: UserType): void {
    User.logIP = async function (uid: string, ip: string | undefined): Promise<void> {
        if (!(parseInt(uid, 10) > 0)) {
            return;
        }
        const now = Date.now();
        const bulk = [
            [`uid:${uid}:ip`, now, ip || 'Unknown'],
        ];
        if (ip) {
            bulk.push([`ip:${ip}:uid`, now, uid]);
        }
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await db.sortedSetAddBulk(bulk);
    };
    User.getIPs = async function (uid: string, stop: number) : Promise<string[]> {
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const ips: string[] = await db.getSortedSetRevRange(`uid:${uid}:ip`, 0, stop) as string[];
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        return ips.map(ip => validator.escape(String(ip)));
    };
    User.getUsersCSV = async function () : Promise<string> {
        winston.verbose('[user/getUsersCSV] Compiling User CSV data');
        const data: {fields: string[]} = await plugins.hooks.fire('filter:user.csvFields', {
            fields: ['uid', 'email', 'username'],
        }) as {fields: string[]};
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        let csvContent = `${data.fields.join(',')}\n`;
        await batch.processSortedSet('users:joindate', async (uids: string[]) => {
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            const usersData: Array<unknown> = await User.getUsersFields(uids, data.fields) as unknown as Array<unknown>;
            csvContent += usersData.reduce((memo: string, user: { [x: string]: string }) => {
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,
                // @typescript-eslint/no-unsafe-call
                memo += `${data.fields.map((field: string | number) => user[field]).join(',')}\n`;
                return memo;
            }, '');
        }, {});
        return csvContent;
    };
    User.exportUsersCSV = async function () : Promise<void> {
        winston.verbose('[user/exportUsersCSV] Exporting User CSV data');

        const { fields, showIps }: { fields: string[]; showIps: boolean } = (await plugins.hooks.fire('filter:user.csvFields', {
            fields: ['email', 'username', 'uid'],
            showIps: true,
        })) as { fields: string[]; showIps: boolean };
        const fd = await fs.promises.open(
            path.join(baseDir as string, 'build/export', 'users.csv'),
            'w'
        );
        // The next line calls a function in a module that has not been updated to TS yet
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await fs.promises.appendFile(fd, `${fields.join(',')}${showIps ? ',ip' : ''}\n`);
        await batch.processSortedSet('users:joindate', async (uids : string[]) => {
            const usersData = await User.getUsersFields(uids, fields.slice());
            let ips : string[] = [];

            if (showIps) {
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
                ips = await db.getSortedSetsMembers(uids.map(uid => `uid:${uid}:ip`)) as string[];
            }

            let line = '';
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            usersData.forEach((user: { [x: string]: any }, index: string | number) => {
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
                line += `${fields.map((field: string | number) => user[field]).join(',')}`;
                if (showIps) {
                    const userIpsValue : string = ips[index];
                    const userIps = Array.isArray(userIpsValue) ? userIpsValue.join(',') : '';
                    line += `,"${userIps}"\n`;
                } else {
                    line += '\n';
                }
            });

            await fs.promises.appendFile(fd, line);
        }, {
            batch: 5000,
            interval: 250,
        });
        await fd.close();
    };
}
