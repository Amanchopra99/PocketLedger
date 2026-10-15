import React, { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { StatusBar } from 'expo-status-bar';

const API = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:8000';
const money = n => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format((n||0)/100);
const today = new Date().toISOString().slice(0,10);
export default function App() {
  const [summary,setSummary] = useState(null), [transactions,setTransactions] = useState([]), [loading,setLoading] = useState(true);
  const [description,setDescription] = useState(''), [amount,setAmount] = useState(''), [kind,setKind] = useState('expense');
  const [category,setCategory] = useState('Food'), [date,setDate] = useState(today), [saving,setSaving] = useState(false);
  async function load() {
    try {
      const month = today.slice(0,7);
      const [s,t] = await Promise.all([fetch(`${API}/api/dashboard/summary?month=${month}`),fetch(`${API}/api/transactions?limit=30`)]);
      if(!s.ok||!t.ok) throw new Error('API not reachable');
      setSummary(await s.json()); setTransactions(await t.json());
    } catch(e) { Alert.alert('Connection issue',`Could not reach API at ${API}. Check backend and device API URL.`); }
    finally { setLoading(false); }
  }
  useEffect(()=>{load()},[]);
  async function add() {
    if(!description.trim()||!amount||Number(amount)<=0) { Alert.alert('Check details','Enter a description and a positive amount.'); return; }
    setSaving(true);
    try {
      const r=await fetch(`${API}/api/transactions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({description:description.trim(),amount_paise:Math.round(Number(amount)*100),type:kind,date,category,payment_method:'Other'})});
      if(!r.ok) throw new Error('Save failed');
      setDescription('');setAmount('');await load();
    } catch(e) { Alert.alert('Could not save','Check the API connection and try again.'); }
    finally {setSaving(false);}
  }
  return <SafeAreaView style={s.screen}><StatusBar style="light"/><ScrollView contentContainerStyle={s.container} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#a294ff"/>}>
    <View style={s.brandRow}><View style={s.logo}><Text style={s.logoText}>P</Text></View><View><Text style={s.brand}>PocketLedger</Text><Text style={s.muted}>YOUR PERSONAL FINANCES</Text></View></View>
    <Text style={s.title}>Your money,{"\n"}in focus.</Text><Text style={s.muted}>A clear picture of where your money goes.</Text>
    <View style={s.cards}><View style={s.card}><Text style={s.label}>INCOME THIS MONTH</Text><Text style={s.value}>{money(summary?.income_paise)}</Text></View><View style={s.card}><Text style={s.label}>EXPENSES THIS MONTH</Text><Text style={s.value}>{money(summary?.expense_paise)}</Text></View><View style={[s.card,s.featured]}><Text style={s.label}>NET CASH FLOW</Text><Text style={s.value}>{money(summary?.net_paise)}</Text></View></View>
    <View style={s.panel}><Text style={s.heading}>Add transaction</Text><TextInput style={s.input} placeholder="What was it for?" placeholderTextColor="#70798b" value={description} onChangeText={setDescription}/><TextInput style={s.input} placeholder="Amount in ₹" placeholderTextColor="#70798b" keyboardType="decimal-pad" value={amount} onChangeText={setAmount}/><View style={s.segment}><Pressable onPress={()=>setKind('expense')} style={[s.segmentBtn,kind==='expense'&&s.segmentActive]}><Text style={s.segmentText}>Expense</Text></Pressable><Pressable onPress={()=>setKind('income')} style={[s.segmentBtn,kind==='income'&&s.segmentActive]}><Text style={s.segmentText}>Income</Text></Pressable></View><TextInput style={s.input} placeholder="Category (e.g. Food)" placeholderTextColor="#70798b" value={category} onChangeText={setCategory}/><TextInput style={s.input} placeholder="Date YYYY-MM-DD" placeholderTextColor="#70798b" value={date} onChangeText={setDate}/><Pressable style={s.primary} onPress={add} disabled={saving}><Text style={s.primaryText}>{saving?'Saving…':'Save transaction'}</Text></Pressable></View>
    <View style={s.sectionRow}><Text style={s.heading}>Recent transactions</Text><Text style={s.muted}>{transactions.length} items</Text></View>
    {loading&&!transactions.length?<ActivityIndicator color="#a294ff"/>:transactions.slice(0,20).map(t=><View key={t.id} style={s.tx}><View style={[s.txIcon,t.type==='income'&&s.txIncome]}><Text style={s.txSymbol}>{t.type==='income'?'↓':'↗'}</Text></View><View style={s.txInfo}><Text style={s.txName}>{t.description}</Text><Text style={s.muted}>{t.category} · {t.date}</Text></View><Text style={[s.txAmount,t.type==='income'&&s.positive]}>{t.type==='income'?'+':'−'}{money(t.amount_paise)}</Text></View>)}
    <Text style={s.footer}>PocketLedger · Keep your money in view.</Text>
  </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({
 screen:{flex:1,backgroundColor:'#0b0e14'},container:{padding:20,paddingBottom:40},brandRow:{flexDirection:'row',alignItems:'center',gap:11,marginBottom:32},logo:{width:38,height:38,borderRadius:12,backgroundColor:'#a294ff',alignItems:'center',justifyContent:'center'},logoText:{fontSize:20,fontWeight:'800',color:'#11121b'},brand:{color:'#f0f1f7',fontSize:17,fontWeight:'800'},muted:{color:'#858da0',fontSize:11,marginTop:4},title:{fontSize:34,fontWeight:'800',lineHeight:39,color:'#f0f1f7',marginBottom:8},cards:{gap:10,marginTop:24,marginBottom:20},card:{backgroundColor:'#131822',borderColor:'#262c39',borderWidth:1,borderRadius:14,padding:17},featured:{backgroundColor:'#201d37',borderColor:'#393252'},label:{fontSize:10,color:'#9da4b5',letterSpacing:1},value:{fontSize:26,fontWeight:'800',color:'#f0f1f7',marginTop:10},panel:{backgroundColor:'#11151e',borderColor:'#252b38',borderWidth:1,borderRadius:14,padding:16,marginBottom:24},heading:{color:'#eef0f7',fontSize:16,fontWeight:'700'},input:{backgroundColor:'#0d1119',borderColor:'#303747',borderWidth:1,borderRadius:9,color:'#eef0f7',padding:13,fontSize:13,marginTop:12},segment:{flexDirection:'row',gap:8,marginTop:12},segmentBtn:{flex:1,padding:12,alignItems:'center',backgroundColor:'#1b202c',borderRadius:8},segmentActive:{backgroundColor:'#393252',borderColor:'#9b8afb',borderWidth:1},segmentText:{color:'#d7d9e4',fontWeight:'600',fontSize:12},primary:{backgroundColor:'#a294ff',borderRadius:9,alignItems:'center',padding:14,marginTop:14},primaryText:{fontWeight:'800',color:'#12121b',fontSize:13},sectionRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:12},tx:{flexDirection:'row',alignItems:'center',paddingVertical:13,borderBottomColor:'#202633',borderBottomWidth:1,gap:10},txIcon:{width:34,height:34,borderRadius:10,backgroundColor:'#2a2522',alignItems:'center',justifyContent:'center'},txIncome:{backgroundColor:'#18312d'},txSymbol:{fontSize:17,color:'#e9b76a'},txInfo:{flex:1},txName:{color:'#eef0f7',fontWeight:'600',fontSize:12},txAmount:{color:'#e7e9f1',fontWeight:'700',fontSize:12},positive:{color:'#51d6a0'},footer:{textAlign:'center',color:'#596274',fontSize:10,marginTop:28}
});
