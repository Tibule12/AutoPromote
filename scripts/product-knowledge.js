#!/usr/bin/env node
'use strict';
const k=require('../src/productKnowledge');
const {writeGenerated}=require('../src/productKnowledge/generate');
const args=process.argv.slice(2),command=args.shift()||'validate';
const option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
try{
  if(command==='review'){
    const lock=k.recordReview({reviewer:option('--reviewer'),reason:option('--reason')});
    console.log(JSON.stringify({reviewed_at:lock.reviewed_at,source_count:lock.sources.length,scope:lock.scope}));
  }else{
    const {book,validation}=k.loadKnowledge();
    if(command==='validate')console.log(JSON.stringify({valid:true,features:book.features.length,controls:book.controls.length,tasks:book.tasks.length,warnings:validation.warnings},null,2));
    else if(command==='build'||command==='check'){
      const result=writeGenerated(book,{check:command==='check'});
      console.log(JSON.stringify({...result,warnings:validation.warnings},null,2));if(!result.valid)process.exitCode=1;
    }else if(command==='search')console.log(JSON.stringify(k.searchKnowledge(args.join(' '),{book:k.projectPublic(book)}),null,2));
    else if(command==='help')console.log(JSON.stringify(k.contextualHelp({help_feature_id:args[0],mode:option('--mode')||'EXPLAIN',control_id:option('--control')||null},{book:k.projectPublic(book)}),null,2));
    else throw new Error('Commands: validate, build, check, review --reviewer NAME --reason TEXT, search QUERY, help FEATURE_ID [--mode EXPLAIN|GUIDE|DIAGNOSE|CREATE] [--control CONTROL_ID]');
  }
}catch(e){console.error(e.message);process.exitCode=1;}
