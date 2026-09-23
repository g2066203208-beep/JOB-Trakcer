const RELATED = {
  "土木工程":["工程力学","工程管理","智能建造","建筑学","城乡规划","水利水电工程","交通工程"],
  "工程力学":["土木工程","机械设计制造及其自动化","车辆工程","航空航天工程"],
  "机械设计制造及其自动化":["机械电子工程","车辆工程","工程力学","能源与动力工程","智能制造工程"],
  "车辆工程":["机械设计制造及其自动化","工程力学","能源与动力工程"],
  "计算机科学与技术":["软件工程","人工智能","数据科学与大数据技术","信息安全","网络工程"],
  "软件工程":["计算机科学与技术","人工智能","数据科学与大数据技术"],
  "人工智能":["计算机科学与技术","软件工程","数据科学与大数据技术","数学与应用数学","统计学"],
  "电气工程及其自动化":["自动化","电子信息工程","能源与动力工程"],
  "能源与动力工程":["新能源科学与工程","储能科学与工程","机械设计制造及其自动化"],
  "金融学":["金融工程","经济学","投资学","保险学"],
  "会计学":["财务管理","审计学","工商管理"],
  "法学":["知识产权","政治学与行政学"],
  "临床医学":["医学影像学","预防医学","医学检验技术"],
  "材料科学与工程":["高分子材料与工程","材料成型及控制工程","化学工程与工艺"]
};

export function scoreJob(job,profile){
  let score=18;
  const reasons=[];
  const gaps=[];
  const text=[job.title,job.requirements,job.majorsText,(job.majorTags||[]).join(" "),(job.skills||[]).join(" "),job.industry].join(" ").toLowerCase();

  if(profile.major){
    if((job.majorTags||[]).includes(profile.major) || text.includes(profile.major.toLowerCase())){
      score+=35;reasons.push("专业直接匹配");
    }else if((RELATED[profile.major]||[]).some(m=>(job.majorTags||[]).includes(m)||text.includes(m.toLowerCase()))){
      score+=22;reasons.push("专业方向相近");
    }else if(/不限专业|专业不限|理工科|相关专业/.test(text)){
      score+=12;reasons.push("专业限制较宽");
    }else{
      gaps.push("需核对专业限制");
    }
  }

  if(profile.degree){
    const degree=job.degree||"";
    if(profile.degree==="博士" && /博士|硕士|研究生|本科/.test(degree)){score+=10;reasons.push("学历满足")}
    else if(profile.degree==="硕士" && /硕士|研究生|本科|按岗位|待核验/.test(degree)){score+=10;reasons.push("学历满足")}
    else if(profile.degree==="本科" && /本科|按岗位|待核验/.test(degree)){score+=10;reasons.push("学历满足")}
    else if(degree && !/待核验|按岗位/.test(degree))gaps.push("学历要求需核对");
  }

  if(profile.cities?.length){
    if(profile.cities.some(c=>(job.location||"").includes(c)||/全国|多地|按岗位/.test(job.location||""))){
      score+=10;reasons.push("地点符合偏好");
    }
  }

  if(profile.industries?.length){
    if(profile.industries.includes(job.industry)){score+=12;reasons.push("目标行业")}
  }

  if(profile.skills?.length){
    const matched=profile.skills.filter(s=>text.includes(s.toLowerCase()));
    if(matched.length){
      score+=Math.min(18,matched.length*6);
      reasons.push("技能匹配："+matched.slice(0,3).join(" / "));
    }
    const jobSkills=job.skills||[];
    const missing=jobSkills.filter(s=>!profile.skills.includes(s)).slice(0,3);
    if(missing.length)gaps.push("可补充："+missing.join(" / "));
  }

  if(job.deadline){
    const left=daysLeft(job.deadline);
    if(left!==null && left>=0 && left<=7) reasons.push("7天内截止");
  }
  if(job.verified) score+=4;
  score=Math.max(1,Math.min(99,score));
  return {score,reasons:reasons.slice(0,4),gaps:gaps.slice(0,3)};
}

export function rankJobs(jobs,profile){
  return jobs.map(job=>({job,...scoreJob(job,profile)})).sort((a,b)=>b.score-a.score);
}

function daysLeft(s){
  if(!s)return null;
  const d=new Date(s+"T00:00:00"),n=new Date();
  const a=new Date(n.getFullYear(),n.getMonth(),n.getDate());
  const b=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  return Math.ceil((b-a)/86400000);
}
