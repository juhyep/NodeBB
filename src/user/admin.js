"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const winston_1 = __importDefault(require("winston"));
const validator_1 = __importDefault(require("validator"));
const constants_1 = require("../constants");
const database_1 = __importDefault(require("../database"));
const plugins_1 = __importDefault(require("../plugins"));
const batch_1 = __importDefault(require("../batch"));
module.exports = function (User) {
    User.logIP = function (uid, ip) {
        return __awaiter(this, void 0, void 0, function* () {
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
            yield database_1.default.sortedSetAddBulk(bulk);
        });
    };
    User.getIPs = function (uid, stop) {
        return __awaiter(this, void 0, void 0, function* () {
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            const ips = yield database_1.default.getSortedSetRevRange(`uid:${uid}:ip`, 0, stop);
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            return ips.map(ip => validator_1.default.escape(String(ip)));
        });
    };
    User.getUsersCSV = function () {
        return __awaiter(this, void 0, void 0, function* () {
            winston_1.default.verbose('[user/getUsersCSV] Compiling User CSV data');
            const data = yield plugins_1.default.hooks.fire('filter:user.csvFields', {
                fields: ['uid', 'email', 'username'],
            });
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            let csvContent = `${data.fields.join(',')}\n`;
            yield batch_1.default.processSortedSet('users:joindate', (uids) => __awaiter(this, void 0, void 0, function* () {
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                const usersData = yield User.getUsersFields(uids, data.fields);
                csvContent += usersData.reduce((memo, user) => {
                    // The next line calls a function in a module that has not been updated to TS yet
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,
                    // @typescript-eslint/no-unsafe-call
                    memo += `${data.fields.map((field) => user[field]).join(',')}\n`;
                    return memo;
                }, '');
            }), {});
            return csvContent;
        });
    };
    User.exportUsersCSV = function () {
        return __awaiter(this, void 0, void 0, function* () {
            winston_1.default.verbose('[user/exportUsersCSV] Exporting User CSV data');
            const { fields, showIps } = (yield plugins_1.default.hooks.fire('filter:user.csvFields', {
                fields: ['email', 'username', 'uid'],
                showIps: true,
            }));
            const fd = yield fs_1.default.promises.open(path_1.default.join(constants_1.baseDir, 'build/export', 'users.csv'), 'w');
            // The next line calls a function in a module that has not been updated to TS yet
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            yield fs_1.default.promises.appendFile(fd, `${fields.join(',')}${showIps ? ',ip' : ''}\n`);
            yield batch_1.default.processSortedSet('users:joindate', (uids) => __awaiter(this, void 0, void 0, function* () {
                const usersData = yield User.getUsersFields(uids, fields.slice());
                let ips = [];
                if (showIps) {
                    // The next line calls a function in a module that has not been updated to TS yet
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
                    ips = (yield database_1.default.getSortedSetsMembers(uids.map(uid => `uid:${uid}:ip`)));
                }
                let line = '';
                // The next line calls a function in a module that has not been updated to TS yet
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
                usersData.forEach((user, index) => {
                    // The next line calls a function in a module that has not been updated to TS yet
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call
                    line += `${fields.map((field) => user[field]).join(',')}`;
                    if (showIps) {
                        const userIpsValue = ips[index];
                        const userIps = Array.isArray(userIpsValue) ? userIpsValue.join(',') : '';
                        line += `,"${userIps}"\n`;
                    }
                    else {
                        line += '\n';
                    }
                });
                yield fs_1.default.promises.appendFile(fd, line);
            }), {
                batch: 5000,
                interval: 250,
            });
            yield fd.close();
        });
    };
};
