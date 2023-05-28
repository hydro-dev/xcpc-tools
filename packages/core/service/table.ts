import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const users = sqliteTable('users', {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    uname: text('uname'),
    password: text('password'),
    priv: integer('priv', { mode: 'number' }),
    loginat: integer('loginat', { mode: 'timestamp_ms' }),
    loginip: text('loginip'),
});

const orgs = sqliteTable('orgs', {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    name: text('name'),
    fullname: text('fullname'),
    logo: text('logo'),
});

const teams = sqliteTable('teams', {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    name: text('name'),
    fullname: text('fullname'),
    members: text('members'),
    seat: integer('seat', { mode: 'number' }),
    photo: text('photo'),
});

const prints = sqliteTable('prints', {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    team: integer('team', { mode: 'number' }),
    content: text('content'),
    filepath: text('filepath'),
    send: integer('send', { mode: 'number' }),
    sendat: integer('sendat', { mode: 'timestamp_ms' }),
    acceptat: integer('acceptat', { mode: 'timestamp_ms' }),
});

const seats = sqliteTable('seats', {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    name: text('name'),
    team: integer('team', { mode: 'number' }),
    ip: text('ip'),
    desktop: text('desktop'),
    webcam: text('webcam'),
});

const balloons = sqliteTable('balloons', {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    team: integer('team', { mode: 'number' }),
    problem: text('problem'),
    send: integer('send', { mode: 'number' }),
    sendat: integer('sendat', { mode: 'timestamp_ms' }),
    acceptat: integer('acceptat', { mode: 'timestamp_ms' }),
});

export {
    users,
    orgs,
    teams,
    prints,
    seats,
    balloons,
};
